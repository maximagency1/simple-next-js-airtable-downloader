import { NextRequest } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const airtable = new Airtable({
  apiKey: process.env.MASTER_AIRTABLE_API_KEY,
});

export async function GET() {
  try {
    // Fetch all bases using Airtable's metadata API
    const metaResponse = await fetch('https://api.airtable.com/v0/meta/bases', {
      headers: {
        'Authorization': `Bearer ${process.env.MASTER_AIRTABLE_API_KEY}`,
      },
    });

    if (!metaResponse.ok) {
      throw new Error(`Airtable API error: ${metaResponse.status}`);
    }

    const metaData = await metaResponse.json();
    const allBases = [];

    // Process each base to get its tables and fields
    for (const baseInfo of metaData.bases) {
      try {
        // Fetch detailed schema for this base
        const schemaResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${baseInfo.id}/tables`, {
          headers: {
            'Authorization': `Bearer ${process.env.MASTER_AIRTABLE_API_KEY}`,
          },
        });

        if (schemaResponse.ok) {
          const schemaData = await schemaResponse.json();
          const tables = schemaData.tables.map((table: { id: string; name: string; fields: any[] }) => ({
            id: table.id,
            name: table.name,
            fields: table.fields
              .filter((field: { type: string }) => field.type === 'multipleAttachments')
              .map((field: { name: string }) => ({
                name: field.name,
                type: 'attachment'
              }))
          }));

          allBases.push({
            id: baseInfo.id,
            name: baseInfo.name,
            tables: tables
          });
        } else {
          // Fallback to old method if schema API fails
          const base = airtable.base(baseInfo.id);
          const tables = await getTablesAndFields(base);
          
          allBases.push({
            id: baseInfo.id,
            name: baseInfo.name,
            tables: tables
          });
        }
      } catch (error) {
        console.error(`Error processing base ${baseInfo.id}:`, error);
        // Continue with other bases even if one fails
        allBases.push({
          id: baseInfo.id,
          name: baseInfo.name,
          tables: []
        });
      }
    }
    
    return Response.json({
      bases: allBases
    });
  } catch (error) {
    console.error('Error fetching bases:', error);
    
    // Fallback to the configured base if metadata API fails
    try {
      const baseId = process.env.MASTER_BASE_ID!;
      const base = airtable.base(baseId);
      const tables = await getTablesAndFields(base);
      
      return Response.json({
        bases: [
          {
            id: baseId,
            name: 'Master Base (Fallback)',
            tables: tables
          }
        ]
      });
    } catch {
      return Response.json(
        { error: 'Failed to fetch bases' },
        { status: 500 }
      );
    }
  }
}

async function getTablesAndFields(base: { (tableId: string): any }) {
  // Try multiple common table names/IDs to find the actual table
  const possibleTableIds = [
    process.env.MASTER_TABLE_ID!, // From env
    'tblEaxaZwBsAUqoTV', // From API response we saw
    'Table 1', // Common default name
    'Main Table'
  ];

  for (const tableId of possibleTableIds) {
    try {
      const table = base(tableId);
      
      // Get a sample record to determine field structure
      const records = await table.select({ maxRecords: 3 }).firstPage();
      
      if (records.length > 0) {
        // Found a working table! Get all field names
        const allFieldNames = new Set<string>();
        records.forEach((record: { fields: Record<string, any> }) => {
          Object.keys(record.fields).forEach(fieldName => {
            allFieldNames.add(fieldName);
          });
        });
        
        const fields = Array.from(allFieldNames).map(fieldName => {
          let fieldType = 'text';
          
          // Check field type across all sample records
          for (const record of records) {
            const fieldValue = record.fields[fieldName];
            if (Array.isArray(fieldValue) && fieldValue.length > 0) {
              if (fieldValue[0]?.type?.startsWith('image/')) {
                fieldType = 'attachment';
                break;
              }
            }
          }
          
          return {
            name: fieldName,
            type: fieldType
          };
        });
        
        return [{
          id: tableId,
          name: `Table (${tableId})`,
          fields: fields
        }];
      }
    } catch {
      // Try next table ID
      continue;
    }
  }

  // If no tables found, return empty
  return [{
    id: 'default',
    name: 'No tables found',
    fields: []
  }];
}
