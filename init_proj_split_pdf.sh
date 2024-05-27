#!/bin/bash

# Set up project folder
PROJECT_NAME="pdf_to_jpegs"
mkdir $PROJECT_NAME
cd $PROJECT_NAME

# Set up virtual environment
python3 -m venv venv

# Create requirements.txt
cat <<EOF > requirements.txt
pymupdf
pillow
EOF

# Create the Python script
cat <<EOF > pdf_to_jpegs.py
import fitz  # PyMuPDF
from PIL import Image
import io
import os

def pdf_to_jpegs(pdf_path, output_folder):
    # Create output folder if it doesn't exist
    os.makedirs(output_folder, exist_ok=True)

    # Open the PDF file
    pdf_document = fitz.open(pdf_path)

    # Iterate through each page
    for page_number in range(len(pdf_document)):
        # Get the page
        page = pdf_document.load_page(page_number)
        # Render page to an image
        pix = page.get_pixmap()
        # Convert to bytes
        img_bytes = pix.tobytes()
        # Open image with PIL
        img = Image.open(io.BytesIO(img_bytes))
        # Save the image
        img.save(f"{output_folder}/page_{page_number + 1}.jpeg", "JPEG")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Convert PDF pages to JPEG images")
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument("output_folder", help="Folder to save the JPEG images")

    args = parser.parse_args()

    pdf_to_jpegs(args.pdf_path, args.output_folder)
EOF

# Create README.md
cat <<EOF > README.md
# PDF to JPEGs

This project converts each page of a PDF into individual JPEG images.

## Setup

1. **Clone the repository:**

    \`\`\`bash
    git clone <repository_url>
    cd $PROJECT_NAME
    \`\`\`

2. **Set up the virtual environment:**

    \`\`\`bash
    python3 -m venv venv
    source venv/bin/activate  # On Windows use 'venv\\Scripts\\activate'
    \`\`\`

3. **Install dependencies:**

    \`\`\`bash
    pip install -r requirements.txt
    \`\`\`

## Usage

Run the script with the path to the PDF file and the output folder where the JPEGs should be saved:

\`\`\`bash
python pdf_to_jpegs.py path_to_your_pdf_file.pdf path_to_output_folder
\`\`\`
EOF

echo "Project setup complete!"
