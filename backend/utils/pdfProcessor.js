const { PDFDocument } = require('pdf-lib');

exports.stampVisualSignature = async (pdfBuffer, base64Image, metadata, position = {}) => {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    const isJpeg = base64Image.includes('data:image/jpeg') || base64Image.includes('data:image/jpg');
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Buffer.from(base64Data, 'base64');
    
    let signatureImage;
    if (isJpeg) {
        signatureImage = await pdfDoc.embedJpg(imageBytes);
    } else {
        signatureImage = await pdfDoc.embedPng(imageBytes);
    }
    
    const pages = pdfDoc.getPages();
    if (pages.length === 0) throw new Error("The PDF document has no pages.");
    
    let targetPageIndex = position.page !== undefined ? position.page : 0;
    if (targetPageIndex >= pages.length || targetPageIndex < 0) {
        targetPageIndex = Math.max(0, Math.min(targetPageIndex, pages.length - 1)); 
    }
    
    const page = pages[targetPageIndex];
    const { width, height } = page.getSize();
    
    // Respect custom frontend scale (normalized relative to 1.0)
    const userScale = (typeof position.imageScale === 'number' && position.imageScale > 0) ? position.imageScale : 1.0;
    
    // Proportional stamp sizing: ~150 PDF points base width (~2 inches on a 595pt A4 page)
    // Ensures signatures look natural regardless of whether source is 400x150 canvas or 4000x3000 photo
    const targetWidth = 150 * userScale;
    const scaleW = targetWidth / signatureImage.width;
    const maxScaleH = (60 * userScale) / signatureImage.height;
    const finalScale = Math.min(scaleW, maxScaleH);
    const imgDims = signatureImage.scale(finalScale); 
    
    let xPos;
    let yPos;

    if (position.pdfViewerWidth && position.pdfViewerHeight && position.x !== undefined && position.y !== undefined) {
        const scaleX = width / position.pdfViewerWidth;
        const scaleY = height / position.pdfViewerHeight;
        
        xPos = position.x * scaleX;
        // In PDF coordinates, origin (0,0) is bottom-left
        // In DOM, position.y is distance from top
        yPos = height - (position.y * scaleY) - imgDims.height; 
    } else if (position.y !== undefined && position.pdfViewerHeight) {
        const domScale = height / position.pdfViewerHeight;
        const invertedDomY = position.y * domScale;
        yPos = height - invertedDomY - imgDims.height; 
        xPos = position.x !== undefined ? position.x : width - imgDims.width - 70;
    } else {
        xPos = width - imgDims.width - 70;
        yPos = 90; 
    }

    // Keep signature safely inside page boundaries
    xPos = Math.max(10, Math.min(xPos, width - imgDims.width - 10));
    yPos = Math.max(10, Math.min(yPos, height - imgDims.height - 10));

    page.drawImage(signatureImage, {
        x: xPos,
        y: yPos,
        width: imgDims.width,
        height: imgDims.height,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
};