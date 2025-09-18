# Airtable Image Downloader Setup

## Environment Configuration

To set up the environment variables for this project, create a `.env.local` file in the root directory with the following variables:

```bash
# Master Airtable Configuration
MASTER_AIRTABLE_API_KEY=your_api_key_here
MASTER_BASE_ID=appoS9oJXkMqCNh89
MASTER_TABLE_ID=tblg9gJhiXITziRS5
```

Replace `your_api_key_here` with your actual Airtable API key. You can generate or manage your API keys from your Airtable account settings.

## Running the Application

1. Make sure you have created the `.env.local` file with your credentials
2. Run the development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser
4. Click the "Download All Images" button to start downloading images from your Airtable base

## How it Works

- The app connects to your Airtable base using the provided credentials
- It scans all records in the specified table for image attachments
- Downloads all images and packages them into a ZIP file
- Provides real-time progress updates during the download process
- Automatically downloads the ZIP file when complete

## Features

- ✅ Real-time progress tracking
- ✅ Error handling and user feedback
- ✅ Automatic file naming with record IDs
- ✅ Support for multiple image formats
- ✅ Clean, modern UI with shadcn/ui components
