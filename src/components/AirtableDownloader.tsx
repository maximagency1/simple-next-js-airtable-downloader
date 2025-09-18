'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Download, Loader2, FileImage } from 'lucide-react';

interface DownloadStatus {
  isDownloading: boolean;
  progress: number;
  currentFile: string;
  totalFiles: number;
  downloadedFiles: number;
  error?: string;
}

interface Field {
  name: string;
  type: string;
}

interface Table {
  id: string;
  name: string;
  fields: Field[];
}

interface Base {
  id: string;
  name: string;
  tables: Table[];
}

interface BasesResponse {
  bases: Base[];
}

interface SimpleTablesResponse {
  baseId: string;
  baseName: string;
  tables: Table[];
}

export default function AirtableDownloader() {
  const [status, setStatus] = useState<DownloadStatus>({
    isDownloading: false,
    progress: 0,
    currentFile: '',
    totalFiles: 0,
    downloadedFiles: 0,
  });

  const [bases, setBases] = useState<Base[]>([]);
  const [selectedBase, setSelectedBase] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [selectedField, setSelectedField] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Fetch all bases
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        console.log('Fetching all bases...');
        const response = await fetch('/api/bases');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: BasesResponse = await response.json();
        console.log('Received bases data:', data);
        setBases(data.bases);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setStatus(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to load data'
        }));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Get current table and its attachment fields
  const currentBase = bases.find(base => base.id === selectedBase);
  const currentTable = currentBase?.tables?.find(table => table.id === selectedTable);
  const attachmentFields = currentTable?.fields?.filter((field: any) => field.type === 'attachment') || [];

  const handleDownload = async () => {
    setStatus({
      isDownloading: true,
      progress: 0,
      currentFile: 'Initializing...',
      totalFiles: 0,
      downloadedFiles: 0,
    });

    try {
      const response = await fetch('/api/download-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseId: selectedBase,
          tableId: selectedTable,
          fieldName: selectedField,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'progress') {
                setStatus(prev => ({
                  ...prev,
                  progress: data.progress,
                  currentFile: data.currentFile,
                  totalFiles: data.totalFiles,
                  downloadedFiles: data.downloadedFiles,
                }));
              } else if (data.type === 'complete') {
                // Download the zip file
                const zipResponse = await fetch('/api/download-zip');
                const blob = await zipResponse.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `airtable-images-${new Date().toISOString().split('T')[0]}.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                setStatus({
                  isDownloading: false,
                  progress: 100,
                  currentFile: 'Download complete!',
                  totalFiles: data.totalFiles,
                  downloadedFiles: data.totalFiles,
                });
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Download error:', error);
      setStatus(prev => ({
        ...prev,
        isDownloading: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      }));
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading bases...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="h-5 w-5" />
          Download Airtable Images
        </CardTitle>
        <CardDescription>
          Select a base, table, and specific column to download images from.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Base Selection */}
        <div className="space-y-2">
          <Label htmlFor="base-select">Airtable Base</Label>
          <Select value={selectedBase || undefined} onValueChange={(value) => setSelectedBase(value || '')}>
            <SelectTrigger>
              <SelectValue placeholder={bases.length > 0 ? "Select a base" : "No bases available"} />
            </SelectTrigger>
            <SelectContent>
              {bases.length > 0 ? (
                bases.map((base) => (
                  <SelectItem key={base.id} value={base.id}>
                    {base.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="no-bases" disabled>
                  No bases found
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Table Selection */}
        <div className="space-y-2">
          <Label htmlFor="table-select">Table</Label>
          <Select value={selectedTable || undefined} onValueChange={(value) => setSelectedTable(value || '')}>
            <SelectTrigger>
              <SelectValue placeholder="Select a table" />
            </SelectTrigger>
            <SelectContent>
              {currentBase?.tables.map((table) => (
                <SelectItem key={table.id} value={table.id}>
                  {table.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Field Selection */}
        {attachmentFields.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="field-select">Image Column</Label>
            <Select value={selectedField || undefined} onValueChange={(value) => setSelectedField(value || '')}>
              <SelectTrigger>
                <SelectValue placeholder="Select an image column" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All image columns</SelectItem>
                {attachmentFields.map((field: any) => (
                  <SelectItem key={field.name} value={field.name}>
                    {field.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {status.error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{status.error}</p>
          </div>
        )}

        {status.isDownloading && (
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{status.currentFile}</span>
              <span>{status.downloadedFiles} / {status.totalFiles}</span>
            </div>
            <Progress value={status.progress} className="w-full" />
          </div>
        )}

        {!status.isDownloading && status.progress === 100 && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800 text-sm">
              Successfully downloaded {status.totalFiles} images!
            </p>
          </div>
        )}

        <Button
          onClick={handleDownload}
          disabled={status.isDownloading || !selectedTable || !selectedBase}
          className="w-full"
          size="lg"
        >
          {status.isDownloading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download Images
              {selectedField && ` from ${selectedField}`}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
