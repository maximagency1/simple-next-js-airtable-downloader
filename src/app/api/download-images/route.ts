import { NextRequest } from 'next/server';
import Airtable from 'airtable';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Configure Airtable
const airtable = new Airtable({
  apiKey: process.env.MASTER_AIRTABLE_API_KEY,
});

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
}

async function downloadImage(url: string, filename: string): Promise<{ buffer: Buffer; filename: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, filename };
}

async function downloadImagesInBatches(
  imageUrls: Array<{ url: string; recordId: string; filename: string }>,
  batchSize: number,
  onProgress: (progress: { downloadedFiles: number; currentFile: string; totalFiles: number }) => void
): Promise<Array<{ buffer: Buffer; filename: string }>> {
  const results: Array<{ buffer: Buffer; filename: string }> = [];
  let downloadedFiles = 0;
  const totalFiles = imageUrls.length;

  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize);
    
    // Download batch in parallel
    const batchPromises = batch.map(async ({ url, filename }) => {
      try {
        const result = await downloadImage(url, filename);
        downloadedFiles++;
        // Only call onProgress after successful download to avoid race conditions
        try {
          onProgress({ downloadedFiles, currentFile: `Downloaded ${filename}`, totalFiles });
        } catch (controllerError) {
          // Ignore controller errors during progress updates
        }
        return result;
      } catch (error) {
        console.error(`Failed to download ${filename}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((result): result is { buffer: Buffer; filename: string } => result !== null));
    
    // Update progress after each batch
    try {
      onProgress({ downloadedFiles, currentFile: `Completed batch ${Math.ceil((i + batchSize) / batchSize)}`, totalFiles });
    } catch (controllerError) {
      // Ignore controller errors
    }
  }

  return results;
}

function extractImageUrls(record: AirtableRecord, fieldName?: string): string[] {
  const urls: string[] = [];
  
  if (fieldName) {
    // Extract from specific field only
    const field = record.fields[fieldName];
    if (Array.isArray(field)) {
      field.forEach(item => {
        if (item && typeof item === 'object' && item.url && item.type?.startsWith('image/')) {
          urls.push(item.url);
        }
      });
    }
  } else {
    // Look through all fields for attachment fields
    Object.values(record.fields).forEach(field => {
      if (Array.isArray(field)) {
        field.forEach(item => {
          if (item && typeof item === 'object' && item.url && item.type?.startsWith('image/')) {
            urls.push(item.url);
          }
        });
      }
    });
  }
  
  return urls;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Parse request body to get selection parameters
        const body = await request.json();
        const { baseId, tableId, fieldName } = body;
        
        // Use provided IDs or fall back to environment variables
        const selectedBaseId = baseId || process.env.MASTER_BASE_ID!;
        const selectedTableId = tableId || process.env.MASTER_TABLE_ID!;
        
        // Get the selected base and table
        const base = airtable.base(selectedBaseId);
        const table = base(selectedTableId);
        
        // Send initial status
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'progress', progress: 0, currentFile: 'Fetching records from Airtable...', totalFiles: 0, downloadedFiles: 0 })}\n\n`)
        );

        // Fetch all records from Airtable
        const records: AirtableRecord[] = [];
        await table.select().eachPage((pageRecords: any, fetchNextPage: any) => {
          records.push(...pageRecords.map((record: any) => ({
            id: record.id,
            fields: record.fields
          })));
          fetchNextPage();
        });

        // Extract all image URLs from specified field or all fields
        const allImageUrls: Array<{ url: string; recordId: string; filename: string }> = [];
        
        records.forEach(record => {
          const imageUrls = extractImageUrls(record, fieldName);
          imageUrls.forEach((url, index) => {
            const extension = url.split('.').pop()?.split('?')[0] || 'jpg';
            const fieldSuffix = fieldName ? `_${fieldName}` : '';
            const filename = `${record.id}${fieldSuffix}_${index + 1}.${extension}`;
            allImageUrls.push({ url, recordId: record.id, filename });
          });
        });

        const totalFiles = allImageUrls.length;
        
        if (totalFiles === 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'No images found in the Airtable base' })}\n\n`)
          );
          controller.close();
          return;
        }

        // Create zip file
        const zip = new JSZip();
        
        // Download images in batches with concurrency limit
        const BATCH_SIZE = 50; // Download 50 images concurrently
        
        const downloadedImages = await downloadImagesInBatches(
          allImageUrls,
          BATCH_SIZE,
          (progress) => {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'progress', 
                  progress: Math.round((progress.downloadedFiles / progress.totalFiles) * 100),
                  currentFile: progress.currentFile,
                  totalFiles: progress.totalFiles,
                  downloadedFiles: progress.downloadedFiles
                })}\n\n`)
              );
            } catch (error) {
              // Ignore controller errors during progress updates
            }
          }
        );

        // Add all downloaded images to zip
        downloadedImages.forEach(({ buffer, filename }) => {
          zip.file(filename, buffer);
        });

        // Generate zip file
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: 'progress', 
              progress: 95,
              currentFile: 'Creating ZIP file...',
              totalFiles,
              downloadedFiles: downloadedImages.length
            })}\n\n`)
          );
        } catch (error) {
          // Ignore controller errors
        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        
        // Save zip file temporarily
        const tempDir = path.join(process.cwd(), 'temp');
        await mkdir(tempDir, { recursive: true });
        const zipPath = path.join(tempDir, 'airtable-images.zip');
        await writeFile(zipPath, zipBuffer);

        // Send completion message
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: 'complete', 
              totalFiles: downloadedImages.length,
              message: 'All images downloaded and zipped successfully!'
            })}\n\n`)
          );
        } catch (error) {
          // Ignore controller errors
        }

        controller.close();
      } catch (error) {
        console.error('Error in download process:', error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: error instanceof Error ? error.message : 'An unknown error occurred'
          })}\n\n`)
        );
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
