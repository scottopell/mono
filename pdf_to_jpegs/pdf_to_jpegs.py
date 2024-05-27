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
