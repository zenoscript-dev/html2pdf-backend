# HTML to PDF Converter API

A production-grade NestJS API that converts HTML content to PDF using Puppeteer.

## Features

- Convert HTML files to PDF
- Convert HTML text to PDF
- Convert webpage URLs to PDF
- Production-ready configuration
- Error handling and validation
- File size limits and timeouts

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory with the following content:

```env
PORT=5000
NODE_ENV=production
MAX_FILE_SIZE=5242880 # 5MB in bytes
PUPPETEER_TIMEOUT=30000 # 30 seconds in milliseconds
```

## Running the API

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### 1. Convert HTML File to PDF

```bash
curl -X POST http://localhost:5000/convert/html-file \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/file.html" \
  --output output.pdf
```

### 2. Convert HTML Text to PDF

```bash
curl -X POST http://localhost:5000/convert/html-text \
  -H "Content-Type: application/json" \
  -d '{"html": "<html><body><h1>Hello World</h1></body></html>"}' \
  --output output.pdf
```

### 3. Convert URL to PDF

```bash
curl -X POST http://localhost:5000/convert/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' \
  --output output.pdf
```

## Error Handling

The API includes robust error handling for:
- Invalid file types
- File size limits (5MB max)
- Timeouts (30 seconds)
- Invalid HTML content
- Network errors
- URL validation

## Security Features

- CORS protection
- Helmet security headers
- Request compression
- File type validation
- Size limits
- Production-ready Puppeteer configuration

## Production Deployment Notes

The API is configured to run Puppeteer with the following flags in production:
- --no-sandbox
- --disable-setuid-sandbox

These flags are necessary for running in some production environments, particularly in containerized deployments.

## Postman Collection

You can import the following curl commands into Postman:

1. HTML File Upload:
```
POST http://localhost:5000/convert/html-file
Body: form-data
Key: file
Value: [Select HTML file]
```

2. HTML Text:
```
POST http://localhost:5000/convert/html-text
Content-Type: application/json
Body: {
  "html": "<html><body><h1>Hello World</h1></body></html>"
}
```

3. URL Conversion:
```
POST http://localhost:5000/convert/url
Content-Type: application/json
Body: {
  "url": "https://example.com"
}
```
