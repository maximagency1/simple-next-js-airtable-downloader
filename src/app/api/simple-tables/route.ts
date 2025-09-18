import { NextResponse } from "next/server";
import { getBaseTables } from "../bases/route";

// Hardcoded table IDs for simple mode with their names
export const SIMPLE_TABLES = [
  { id: "tblETQc4pbqxmXe36", name: "Table 1" },
  { id: "tblrTdaEKwrnLq1Jq", name: "Table 2" },
  { id: "tblEaxaZwBsAUqoTV", name: "Table 3" },
  { id: "tblpnn4YfABsmJnVT", name: "Table 4" },
];

// Hardcoded base ID for simple mode
const SIMPLE_BASE_ID = process.env.MASTER_BASE_ID || "appoS9oJXkMqCNh89";

// Get table schema with fields (particularly for attachment fields)
async function getTableSchema(apiKey: string, baseId: string, tableId: string) {
  try {
    const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch schema for table ${tableId}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching schema for table ${tableId}:`, error);
    return null;
  }
}

// API route to get simple mode tables with attachment fields
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.MASTER_AIRTABLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Airtable API key is not configured" },
        { status: 500 }
      );
    }

    if (!SIMPLE_BASE_ID) {
      return NextResponse.json(
        { error: "Base ID is not configured" },
        { status: 500 }
      );
    }

    // Fetch fields for each table
    const tablesWithFields = await Promise.all(
      SIMPLE_TABLES.map(async (table) => {
        const schema = await getTableSchema(apiKey, SIMPLE_BASE_ID, table.id);
        const fields = schema?.fields || [];
        return { 
          id: table.id,
          name: table.name,
          fields: fields
            .filter((field: any) => field.type === 'multipleAttachments')
            .map((field: any) => ({
              name: field.name,
              type: 'attachment'
            }))
        };
      })
    );

    return NextResponse.json({
      baseId: SIMPLE_BASE_ID,
      baseName: 'Master Base',
      tables: tablesWithFields
    });
  } catch (error) {
    console.error("Error fetching simple mode tables:", error);
    return NextResponse.json(
      { error: "Failed to fetch simple mode tables" },
      { status: 500 }
    );
  }
}
