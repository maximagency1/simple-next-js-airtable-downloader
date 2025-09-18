import { NextResponse } from "next/server";

// Use the actual table ID from your environment
export const SIMPLE_TABLES = [
  { id: process.env.MASTER_TABLE_ID || "tblg9gJhiXITziRS5", name: "Main Table" },
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
export async function GET() {
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

    // Fetch fields for each table with error handling
    const tablesWithFields = await Promise.all(
      SIMPLE_TABLES.map(async (table) => {
        try {
          const schema = await getTableSchema(apiKey, SIMPLE_BASE_ID, table.id);
          const fields = schema?.fields || [];
          return { ...table, fields };
        } catch (error) {
          console.error(`Error fetching schema for table ${table.id}:`, error);
          // Return table with empty fields if schema fetch fails
          return { ...table, fields: [] };
        }
      })
    );

    return NextResponse.json({
      baseId: SIMPLE_BASE_ID,
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
