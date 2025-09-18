import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

export async function GET(request: NextRequest) {
  try {
    const zipPath = path.join(process.cwd(), 'temp', 'airtable-images.zip');
    
    // Check if file exists
    if (!fs.existsSync(zipPath)) {
      return new Response('ZIP file not found', { status: 404 });
    }

    // Read the zip file
    const zipBuffer = await readFile(zipPath);
    
    // Clean up the temporary file
    try {
      await unlink(zipPath);
    } catch (error) {
      console.error('Failed to delete temporary zip file:', error);
    }

    // Return the zip file
    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="airtable-images-${new Date().toISOString().split('T')[0]}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error serving zip file:', error);
    return new Response('Error serving zip file', { status: 500 });
  }
}
