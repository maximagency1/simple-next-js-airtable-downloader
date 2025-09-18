import { NextRequest } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const airtable = new Airtable({
  apiKey: process.env.MASTER_AIRTABLE_API_KEY,
});

const SIMPLE_MODE_BASE_ID = 'appoS9oJXkMqCNh89';
const SIMPLE_MODE_TABLE_IDS = [
  'tblETQc4pbqxmXe36',
  'tblrTdaEKwrnLq1Jq', 
  'tblEaxaZwBsAUqoTV',
  'tblpnn4YfABsmJnVT'
];

export async function GET(request: NextRequest) {
  try {
    // Fetch table names for the predefined tables
    const schemaResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${SIMPLE_MODE_BASE_ID}/tables`, {
      headers: {
        'Authorization': `Bearer ${process.env.MASTER_AIRTABLE_API_KEY}`,
      },
    });

    if (!schemaResponse.ok) {
      throw new Error(`Airtable API error: ${schemaResponse.status}`);
    }

    const schemaData = await schemaResponse.json();
    
    // Filter to only the tables we want and get their names
    const simpleTables = schemaData.tables
      .filter((table: any) => SIMPLE_MODE_TABLE_IDS.includes(table.id))
      .map((table: any) => ({
        id: table.id,
        name: table.name,
        fields: table.fields
          .filter((field: any) => field.type === 'multipleAttachments')
          .map((field: any) => ({
            name: field.name,
            type: 'attachment'
          }))
      }));

    return Response.json({
      baseId: SIMPLE_MODE_BASE_ID,
      baseName: 'Master Base',
      tables: simpleTables
    });
  } catch (error) {
    console.error('Error fetching simple mode tables:', error);
    return Response.json(
      { error: 'Failed to fetch simple mode tables' },
      { status: 500 }
    );
  }
}
