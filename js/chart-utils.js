
export function sizeCanvasForDisplay(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    if (cssWidth === 0 || cssHeight === 0) {
        return { width: 0, height: 0 };
    }

    const targetWidth = Math.round(cssWidth * dpr);
    const targetHeight = Math.round(cssHeight * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { width: cssWidth, height: cssHeight };
}

export function drawAxisCaptions(ctx, { width, height, pad, color, yLabel, xLabel }) {
    ctx.fillStyle = color;
    ctx.font = '10px Arial';

    ctx.textAlign = 'left';
    ctx.fillText(yLabel, 4, 12);

    ctx.textAlign = 'center';
    ctx.fillText(xLabel, pad + (width - 2 * pad) / 2, height - 8);

    ctx.textAlign = 'left';
}
