// Top Viewer Controls
const topTrSlider = document.getElementById('topTrSlider');
const topTeSlider = document.getElementById('topTeSlider');
const topTiSlider = document.getElementById('topTiSlider');
const topTseToggle = document.getElementById('topTseToggle');
const topIrToggle = document.getElementById('topIrToggle');
const topFatSatToggle = document.getElementById('topFatSatToggle');

const topTrValDisplay = document.getElementById('topTrVal');
const topTeValDisplay = document.getElementById('topTeVal');
const topTiValDisplay = document.getElementById('topTiVal');

// Stage 2 Controls
const trSlider = document.getElementById('trSlider');
const teSlider = document.getElementById('teSlider');
const tiSlider = document.getElementById('tiSlider');
const tseToggle = document.getElementById('tseToggle');
const etlSlider = document.getElementById('etlSlider');
const irToggle = document.getElementById('irToggle');
const fatSatToggle = document.getElementById('fatSatToggle');

// Phase Encode & Wrap Controls
const phaseEncodeHoriz = document.getElementById('phaseEncodeHoriz');
const phaseEncodeVert = document.getElementById('phaseEncodeVert');
const phaseWrapToggle = document.getElementById('phaseWrapToggle');

const trValDisplay = document.getElementById('trVal');
const teValDisplay = document.getElementById('teVal');
const tiValDisplay = document.getElementById('tiVal');
const etlValDisplay = document.getElementById('etlVal');

const b0Slider = document.getElementById('b0Slider');
const rbwSlider = document.getElementById('rbwSlider');
const b0Val = document.getElementById('b0Val');
const rbwVal = document.getElementById('rbwVal');

const thickSlider = document.getElementById('thickSlider');
const matrixSlider = document.getElementById('matrixSlider');
const nsaSlider = document.getElementById('nsaSlider');
const thickVal = document.getElementById('thickVal');
const matrixVal = document.getElementById('matrixVal');
const nsaVal = document.getElementById('nsaVal');

const snrValDisplay = document.getElementById('snrVal');
const cnrValDisplay = document.getElementById('cnrVal');
const sarValDisplay = document.getElementById('sarVal');
const scanTimeValDisplay = document.getElementById('scanTimeVal');
const resValDisplay = document.getElementById('resVal');
const outPlaneResValDisplay = document.getElementById('outPlaneResVal');
const tradeoffPanel = document.getElementById('tradeoffPanel');

const matrixLevels = [64, 128, 256, 512];
const b0Levels = [0.5, 1.0, 1.5, 3.0];

const acquireBtn = document.getElementById('acquireBtn');

const localizerCanvas = document.getElementById('localizerCanvas');
const locCtx = localizerCanvas.getContext('2d');
const outputCanvas = document.getElementById('outputCanvas');
const outCtx = outputCanvas.getContext('2d');

const tissues = [
    { name: 'fat', t1: 250, t2: 70, pd: 0.9 },
    { name: 'muscle', t1: 900, t2: 40, pd: 0.7 },
    { name: 'bone', t1: 300, t2: 10, pd: 0.2 },
    { name: 'csf', t1: 3000, t2: 800, pd: 1.0 },
    { name: 'greymatter', t1: 900, t2: 100, pd: 0.8 },
    { name: 'whitematter', t1: 600, t2: 80, pd: 0.7 }
];

const loadedImages = {};
let imagesLoadedCount = 0;

// Robust path resolution for GitHub Pages subdirectories
const repoBasePath = (window.location.pathname.includes('/') && !window.location.pathname.endsWith('/'))
    ? window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1)
    : window.location.pathname;

tissues.forEach(t => {
    const img = new Image();
    img.src = `${repoBasePath}${t.name}.png`;
    img.onload = () => {
        imagesLoadedCount++;
        if (imagesLoadedCount === tissues.length) {
            drawLocalizer();
            drawTop();
            runAcquisition();
        }
    };
    loadedImages[t.name] = img;
});

// Mutually exclusive behavior logic for Phase Encode checkboxes
if (phaseEncodeHoriz && phaseEncodeVert) {
    phaseEncodeHoriz.addEventListener('change', () => {
        if (phaseEncodeHoriz.checked) {
            phaseEncodeVert.checked = false;
        } else {
            phaseEncodeHoriz.checked = true;
        }
    });

    phaseEncodeVert.addEventListener('change', () => {
        if (phaseEncodeVert.checked) {
            phaseEncodeHoriz.checked = false;
        } else {
            phaseEncodeHoriz.checked = true;
        }
    });
}

function updateControlStates() {
    const isTopIR = topIrToggle.checked;
    const isTopFatSatOn = topFatSatToggle.checked;
    topTiSlider.disabled = !isTopIR;
    topFatSatToggle.disabled = isTopIR;
    topIrToggle.disabled = isTopFatSatOn;

    const isIR = irToggle.checked;
    const isFatSatOn = fatSatToggle.checked;
    const isTSE = tseToggle.checked;
    
    tiSlider.disabled = !isIR;
    fatSatToggle.disabled = isIR;
    irToggle.disabled = isFatSatOn;
    
    etlSlider.disabled = !isTSE;
}

function getTissueSignal(t, TR, TE, TI, isTSE, isIR, isFatSatOn) {
    let signal;
    if (isIR) {
        const recoveryTerm = Math.abs(1 - (2 * Math.exp(-TI / t.t1)) + Math.exp(-TR / t.t1));
        const decayTerm = Math.exp(-TE / t.t2);
        signal = t.pd * recoveryTerm * decayTerm;
    } else {
        signal = t.pd * (1 - Math.exp(-TR / t.t1)) * Math.exp(-TE / t.t2);
        if (t.name === 'fat' && TR > 1500 && TE > 60 && isTSE) {
            signal = 0.85; 
        }
    }
    if (t.name === 'fat' && isFatSatOn) {
        signal = 0.0;
    }
    return Math.min(signal, 1);
}

function updateMetrics() {
    const matrixSize = matrixLevels[parseInt(matrixSlider.value)];
    const sliceThick = parseFloat(thickSlider.value);
    const nsa = parseInt(nsaSlider.value);
    const b0 = b0Levels[parseInt(b0Slider.value)];
    const rbw = parseFloat(rbwSlider.value);
    const TE = parseFloat(teSlider.value);
    const TR = parseFloat(trSlider.value);
    const TI = parseFloat(tiSlider.value);
    const isTSE = tseToggle.checked;
    const isIR = irToggle.checked;
    const isFatSatOn = fatSatToggle.checked;
    const isOversamplingOn = phaseWrapToggle ? phaseWrapToggle.checked : true;
    
    const etl = isTSE ? parseInt(etlSlider.value) : 1;
    etlValDisplay.innerText = etlSlider.value;

    const roi = document.getElementById('roiBox');
    const containerSize = 370;
    
    const fovMm = (roi.offsetWidth / containerSize) * 220;
    const inPlaneRes = fovMm / matrixSize;

    const gm = tissues.find(t => t.name === 'greymatter');
    const wm = tissues.find(t => t.name === 'whitematter');
    
    const gmSignal = getTissueSignal(gm, TR, TE, TI, isTSE, isIR, isFatSatOn);
    const wmSignal = getTissueSignal(wm, TR, TE, TI, isTSE, isIR, isFatSatOn);
    const signalDiff = Math.abs(gmSignal - wmSignal);

    const voxelVolume = inPlaneRes * inPlaneRes * sliceThick;
    const standardVolume = (220 / 256) * (220 / 256) * 5;

    const b0Factor = b0 / 1.5;
    const rbwFactor = Math.sqrt(32 / rbw);

    const snr = (voxelVolume / standardVolume) * Math.sqrt(nsa) * gmSignal * b0Factor * rbwFactor * 120;
    snrValDisplay.innerText = Math.max(0.1, snr).toFixed(1);
    
    const cnr = snr * signalDiff;
    cnrValDisplay.innerText = Math.max(0.0, cnr).toFixed(1);

    // Phase oversampling doubles phase lines acquired, increasing scan time by 2x when active
    const phaseMultiplier = isOversamplingOn ? 2 : 1;
    const totalSeconds = Math.round((matrixSize / etl) * phaseMultiplier * (TR / 1000) * nsa);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    scanTimeValDisplay.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    const sar = Math.max(0.1, Math.pow(b0 / 1.5, 2) * (2000 / TR) * etl * 0.2);
    sarValDisplay.innerText = sar.toFixed(2);

    resValDisplay.innerText = inPlaneRes.toFixed(2);
    outPlaneResValDisplay.innerText = sliceThick.toFixed(1);

    const minTeRequired = Math.round((matrixSize / (rbw * 1.0)) + 5);

    let warnings = [];
    let maxSeverity = 'green';

    if (sar > 3.2) {
        warnings.push({
            text: `<strong>CRITICAL SAR WARNING:</strong> Estimated SAR (${sar.toFixed(2)} W/kg) exceeds regulatory thermal safety limits. Increase TR or reduce ETL immediately.
                   <div style="margin-top: 6px; font-family: monospace; font-size: 13px; font-weight: bold; color: #ffadad; background: rgba(0,0,0,0.4); padding: 5px 8px; border-radius: 4px;">
                       Formula: SAR ∝ (B₀ / 1.5)² × (2000 / TR) × ETL
                   </div>`,
            level: 'red'
        });
        maxSeverity = 'red';
    } else if (sar > 2.0) {
        warnings.push({
            text: `<strong>SAR Warning:</strong> High RF energy deposition (${sar.toFixed(2)} W/kg) due to long echo train length at high field. Consider increasing TR or shortening ETL.
                   <div style="margin-top: 6px; font-family: monospace; font-size: 13px; font-weight: bold; color: #ffadad; background: rgba(0,0,0,0.4); padding: 5px 8px; border-radius: 4px;">
                       Formula: SAR ∝ (B₀ / 1.5)² × (2000 / TR) × ETL
                   </div>`,
            level: 'red'
        });
        if (maxSeverity !== 'red') maxSeverity = 'red';
    }

    if (TE < minTeRequired) {
        warnings.push({
            text: `<strong>Readout Warning:</strong> Low RBW (${rbw} kHz) requires a readout window longer than current TE. Minimum safe TE is ~<strong>${minTeRequired} ms</strong>.
                   <div style="margin-top: 6px; font-family: monospace; font-size: 13px; font-weight: bold; color: #ffadad; background: rgba(0,0,0,0.4); padding: 5px 8px; border-radius: 4px;">
                       Formula: Min TE ≈ (Matrix Size / RBW) + 5 ms
                   </div>`,
            level: 'red'
        });
        if (maxSeverity !== 'red') maxSeverity = 'red';
    }

    if (rbw > 150 && TE > 40) {
        warnings.push({
            text: `<strong>Inefficient Setup:</strong> High RBW reduces SNR unnecessarily for long T2-weighted sequences. Consider lowering RBW to boost SNR.
                   <div style="margin-top: 6px; font-family: monospace; font-size: 13px; font-weight: bold; color: #fff2b3; background: rgba(0,0,0,0.4); padding: 5px 8px; border-radius: 4px;">
                       Rule: High RBW ( > 150 kHz ) widens noise bandwidth, hurting SNR on long TE.
                   </div>`,
            level: 'yellow'
        });
        if (maxSeverity === 'green') maxSeverity = 'yellow';
    }

    if (warnings.length > 0) {
        tradeoffPanel.style.borderLeftColor = maxSeverity === 'red' ? '#ff2a2a' : '#ffeb3b';
        let htmlContent = `<strong>Clinical Trade-offs (${warnings.length} active):</strong>`;
        warnings.forEach(w => {
            htmlContent += `<div style="margin-top: 6px; padding: 6px 8px; background: rgba(0,0,0,0.4); border-left: 2px solid ${w.level === 'red' ? '#ff5252' : '#ffeb3b'};">${w.text}</div>`;
        });
        tradeoffPanel.innerHTML = htmlContent;
    } else {
        tradeoffPanel.style.borderLeftColor = '#4CAF50';
        tradeoffPanel.innerHTML = `<strong>Clinical Trade-off:</strong> Parameters optimized. Thermal safety and readout constraints are within normal clinical limits.`;
    }
}

function drawTop() {
    topTrValDisplay.innerText = topTrSlider.value;
    topTeValDisplay.innerText = topTeSlider.value;
    topTiValDisplay.innerText = topTiSlider.value;

    const TR = parseFloat(topTrSlider.value);
    const TE = parseFloat(topTeSlider.value);
    const TI = parseFloat(topTiSlider.value);
    const isTSE = topTseToggle.checked;
    const isIR = topIrToggle.checked;
    const isFatSatOn = topFatSatToggle.checked;

    tissues.forEach(t => {
        const brightness = getTissueSignal(t, TR, TE, TI, isTSE, isIR, isFatSatOn);
        const img = document.getElementById(`layer-${t.name}`);
        if (img && !img.dataset.hovered) {
            img.style.filter = `brightness(${brightness})`;
        }
        
        const legendBox = document.querySelector(`.${t.name}-box`);
        if (legendBox) {
            const rgbVal = Math.floor(brightness * 255);
            legendBox.style.backgroundColor = `rgb(${rgbVal}, ${rgbVal}, ${rgbVal})`;
        }
    });
}

function drawLocalizerVessels() {
    const sampleImg = loadedImages['fat'];
    if (!sampleImg || !sampleImg.complete) return;

    const centerX = sampleImg.naturalWidth * 0.5;
    const vesselY = sampleImg.naturalHeight - 65;
    const vessels = [
        { x: centerX - 75, y: vesselY },
        { x: centerX + 75, y: vesselY }
    ];

    const scaleX = localizerCanvas.width / sampleImg.naturalWidth;
    const scaleY = localizerCanvas.height / sampleImg.naturalHeight;
    const radius = Math.max(4, Math.round(sampleImg.naturalWidth * 0.0315 * scaleX));

    vessels.forEach(v => {
        const x = v.x * scaleX;
        const y = v.y * scaleY;

        locCtx.save();
        locCtx.fillStyle = 'rgba(210, 210, 220, 0.9)';
        locCtx.beginPath();
        locCtx.arc(x, y, radius, 0, Math.PI * 2);
        locCtx.fill();

        locCtx.fillStyle = 'rgba(15, 15, 20, 0.95)';
        locCtx.beginPath();
        locCtx.arc(x, y, radius * 0.65, 0, Math.PI * 2);
        locCtx.fill();
        locCtx.restore();
    });
}

function drawLocalizer() {
    locCtx.clearRect(0, 0, localizerCanvas.width, localizerCanvas.height);
    locCtx.fillStyle = '#111';
    locCtx.fillRect(0, 0, localizerCanvas.width, localizerCanvas.height);

    const t1TR = 500;
    const t1TE = 15;

    tissues.forEach(t => {
        const img = loadedImages[t.name];
        if (img && img.complete) {
            let signal = t.pd * (1 - Math.exp(-t1TR / t.t1)) * Math.exp(-t1TE / t.t2);
            signal = Math.min(Math.max(signal, 0), 1);

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = localizerCanvas.width;
            tempCanvas.height = localizerCanvas.height;
            const tempCtx = tempCanvas.getContext('2d');

            tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.globalCompositeOperation = 'source-in';
            tempCtx.fillStyle = `rgb(${signal * 255}, ${signal * 255}, ${signal * 255})`;
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

            locCtx.drawImage(tempCanvas, 0, 0);
        }
    });

    drawLocalizerVessels();
}

function drawVesselsAndGhostsDirect(ctx, width, height) {
    const centerX = width * 0.5;
    const vesselY = height - 65;
    const vessels = [
        { x: centerX - 75, y: vesselY },
        { x: centerX + 75, y: vesselY }
    ];

    const peDir = (phaseEncodeVert && phaseEncodeVert.checked) ? 'col' : 'row';

    vessels.forEach(v => {
        const radius = Math.max(4, Math.round(width * 0.0315));

        const renderSingle = (x, y, alpha) => {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(210, 210, 220, 0.9)';
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(15, 15, 20, 0.95)';
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.65, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        renderSingle(v.x, v.y, 1.0);

        const numGhosts = 3;
        const ghostSpacing = Math.max(20, Math.round(height * 0.15));
        for (let i = -numGhosts; i <= numGhosts; i++) {
            if (i === 0) continue;
            let gx = v.x;
            let gy = v.y;
            const offset = i * ghostSpacing;
            const absI = Math.abs(i);
            const ghostAlpha = Math.max(0.02, 0.35 / (absI * 0.8));

            if (peDir === 'col') {
                gy += offset;
            } else {
                gx += offset;
            }
            renderSingle(gx, gy, ghostAlpha);
        }
    });
}

function runAcquisition() {
    trValDisplay.innerText = trSlider.value;
    teValDisplay.innerText = teSlider.value;
    tiValDisplay.innerText = tiSlider.value;
    matrixVal.innerText = matrixLevels[matrixSlider.value];
    b0Val.innerText = b0Levels[b0Slider.value];
    rbwVal.innerText = rbwSlider.value;

    updateMetrics();

    const TR = parseFloat(trSlider.value);
    const TE = parseFloat(teSlider.value);
    const TI = parseFloat(tiSlider.value);
    const isTSE = tseToggle.checked;
    const isIR = irToggle.checked;
    const isFatSatOn = fatSatToggle.checked;

    const matrixSize = matrixLevels[parseInt(matrixSlider.value)];
    const sliceThick = parseFloat(thickSlider.value);
    const nsa = parseInt(nsaSlider.value);
    const b0 = b0Levels[parseInt(b0Slider.value)];
    const rbw = parseFloat(rbwSlider.value);
    const isOversamplingOn = phaseWrapToggle ? phaseWrapToggle.checked : true;

    const roi = document.getElementById('roiBox');
    const containerSize = 370;
    
    const sampleImg = loadedImages['fat'];
    if (!sampleImg || !sampleImg.complete) return;
    
    const scaleFactor = sampleImg.naturalWidth / containerSize;

    const roiX = roi.offsetLeft * scaleFactor;
    const roiY = roi.offsetTop * scaleFactor;
    const roiW = roi.offsetWidth * scaleFactor;
    const roiH = roi.offsetHeight * scaleFactor;

    // 1. Build base anatomy offscreen canvas
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = sampleImg.naturalWidth;
    offscreenCanvas.height = sampleImg.naturalHeight;
    const offCtx = offscreenCanvas.getContext('2d');

    offCtx.fillStyle = '#000';
    offCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    tissues.forEach(t => {
        const weight = getTissueSignal(t, TR, TE, TI, isTSE, isIR, isFatSatOn);
        const img = loadedImages[t.name];
        if (img && img.complete) {
            const tempTissueCanvas = document.createElement('canvas');
            tempTissueCanvas.width = offscreenCanvas.width;
            tempTissueCanvas.height = offscreenCanvas.height;
            const tempCtx = tempTissueCanvas.getContext('2d');
            
            tempCtx.drawImage(img, 0, 0);
            tempCtx.globalCompositeOperation = 'source-in';
            tempCtx.fillStyle = `rgb(${weight * 255}, ${weight * 255}, ${weight * 255})`;
            tempCtx.fillRect(0, 0, tempTissueCanvas.width, tempTissueCanvas.height);

            offCtx.drawImage(tempTissueCanvas, 0, 0);
        }
    });

    // 2. Draw vessels and ghost artifacts directly onto the anatomical source
    drawVesselsAndGhostsDirect(offCtx, sampleImg.naturalWidth, sampleImg.naturalHeight);

    // 3. Setup output matrix container
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = matrixSize;
    tempCanvas.height = matrixSize;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.imageSmoothingEnabled = true;

    if (!isOversamplingOn) {
        const peDir = (phaseEncodeVert && phaseEncodeVert.checked) ? 'col' : 'row';

        // Build a tiled canvas strictly along the active phase-encoding axis with additive blending
        const tiledCanvas = document.createElement('canvas');
        if (peDir === 'col') {
            tiledCanvas.width = sampleImg.naturalWidth;
            tiledCanvas.height = sampleImg.naturalHeight + roiH * 4;
        } else {
            tiledCanvas.width = sampleImg.naturalWidth + roiW * 4;
            tiledCanvas.height = sampleImg.naturalHeight;
        }
        const tCtx = tiledCanvas.getContext('2d');

        tCtx.fillStyle = '#000';
        tCtx.fillRect(0, 0, tiledCanvas.width, tiledCanvas.height);
        
        // Use additive blending so overlapping wrapped anatomy superimposes correctly like MRI signal summation
        tCtx.globalCompositeOperation = 'lighter';

        if (peDir === 'col') {
            for (let y = -roiH * 2; y < tiledCanvas.height; y += roiH) {
                tCtx.drawImage(offscreenCanvas, 0, y);
            }
            tempCtx.drawImage(
                tiledCanvas,
                roiX, roiY + roiH * 2, roiW, roiH,
                0, 0, matrixSize, matrixSize
            );
        } else {
            for (let x = -roiW * 2; x < tiledCanvas.width; x += roiW) {
                tCtx.drawImage(offscreenCanvas, x, 0);
            }
            tempCtx.drawImage(
                tiledCanvas,
                roiX + roiW * 2, roiY, roiW, roiH,
                0, 0, matrixSize, matrixSize
            );
        }
    } else {
        // Oversampling ON: Clean crop without wrap
        tempCtx.drawImage(
            offscreenCanvas,
            roiX, roiY, roiW, roiH,
            0, 0, matrixSize, matrixSize
        );
    }

    const fovMm = (roi.offsetWidth / containerSize) * 220;
    const inPlaneRes = fovMm / matrixSize;
    const voxelVolume = inPlaneRes * inPlaneRes * sliceThick;
    const standardVolume = (220 / 256) * (220 / 256) * 5;
    const b0Factor = b0 / 1.5;
    const rbwFactor = Math.sqrt(32 / rbw);
    const gm = tissues.find(t => t.name === 'greymatter');
    const signalWeight = gm.pd * (1 - Math.exp(-TR / gm.t1)) * Math.exp(-TE / gm.t2);
    const currentSnr = (voxelVolume / standardVolume) * Math.sqrt(nsa) * signalWeight * b0Factor * rbwFactor * 120;

    const noiseOpacity = Math.max(0, Math.min(0.95, 1.2 / Math.pow(currentSnr, 0.6) - 0.1));
    
    if (noiseOpacity > 0.01) {
        const noiseCanvas = document.createElement('canvas');
        noiseCanvas.width = matrixSize;
        noiseCanvas.height = matrixSize;
        const noiseCtx = noiseCanvas.getContext('2d');
        
        const noiseImgData = noiseCtx.createImageData(matrixSize, matrixSize);
        const data = noiseImgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const val = Math.random() * 255;
            data[i]     = val;
            data[i + 1] = val;
            data[i + 2] = val;
            data[i + 3] = 255;
        }
        noiseCtx.putImageData(noiseImgData, 0, 0);

        tempCtx.save();
        tempCtx.globalCompositeOperation = 'source-over';
        tempCtx.globalAlpha = noiseOpacity;
        tempCtx.drawImage(noiseCanvas, 0, 0);
        tempCtx.restore();
    }

    outCtx.imageSmoothingEnabled = (matrixSize >= 256);
    outCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    outCtx.drawImage(
        tempCanvas,
        0, 0, matrixSize, matrixSize,
        0, 0, outputCanvas.width, outputCanvas.height
    );
}

// Event Listeners - Stage 2 Sliders & Controls
trSlider.addEventListener('input', () => { trValDisplay.innerText = trSlider.value; updateMetrics(); });
teSlider.addEventListener('input', () => { teValDisplay.innerText = teSlider.value; updateMetrics(); });
tiSlider.addEventListener('input', () => { tiValDisplay.innerText = tiSlider.value; updateMetrics(); });
etlSlider.addEventListener('input', () => { etlValDisplay.innerText = etlSlider.value; updateMetrics(); });

b0Slider.addEventListener('input', () => { b0Val.innerText = b0Levels[b0Slider.value]; updateMetrics(); });
rbwSlider.addEventListener('input', () => { rbwVal.innerText = rbwSlider.value; updateMetrics(); });

thickSlider.addEventListener('input', () => { thickVal.innerText = thickSlider.value; updateMetrics(); });
matrixSlider.addEventListener('input', () => { matrixVal.innerText = matrixLevels[matrixSlider.value]; updateMetrics(); });
nsaSlider.addEventListener('input', () => { nsaVal.innerText = nsaSlider.value; updateMetrics(); });

if (phaseWrapToggle) {
    phaseWrapToggle.addEventListener('change', () => { updateMetrics(); });
}

// ROI Drag and Resize Logic
const roiBox = document.getElementById('roiBox');
const resizeHandle = roiBox.querySelector('.resize-handle');

let isDragging = false;
let isResizing = false;
let startX, startY, startSize;

roiBox.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    isDragging = true;
    startX = e.clientX - roiBox.offsetLeft;
    startY = e.clientY - roiBox.offsetTop;
    e.preventDefault();
});

resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startSize = roiBox.offsetWidth;
    e.stopPropagation();
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    const containerSize = 370;

    if (isDragging) {
        let newX = e.clientX - startX;
        let newY = e.clientY - startY;

        const maxCoord = containerSize - roiBox.offsetWidth;
        newX = Math.max(0, Math.min(newX, maxCoord));
        newY = Math.max(0, Math.min(newY, maxCoord));

        roiBox.style.left = `${newX}px`;
        roiBox.style.top = `${newY}px`;
        updateMetrics();
    } else if (isResizing) {
        const dx = e.clientX - startX;
        let newSize = startSize + dx;

        const maxAllowed = containerSize - Math.max(roiBox.offsetLeft, roiBox.offsetTop);
        newSize = Math.max(60, Math.min(newSize, maxAllowed));

        roiBox.style.width = `${newSize}px`;
        roiBox.style.height = `${newSize}px`;
        updateMetrics();
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
});

acquireBtn.addEventListener('click', runAcquisition);

// Legend Mouse Hover Effects
document.querySelectorAll('.legend-item').forEach(item => {
    const tissueName = item.getAttribute('data-tissue');
    const img = document.getElementById(`layer-${tissueName}`);

    item.addEventListener('mouseenter', () => {
        if (img) {
            img.dataset.hovered = "true";
            img.style.filter = 'brightness(1.5) sepia(1) hue-rotate(150deg) saturate(5)';
        }
    });

    item.addEventListener('mouseleave', () => {
        if (img) {
            img.dataset.hovered = "";
            drawTop();
        }
    });
});

// Event Listeners - Top Viewer Controls
topTrSlider.addEventListener('input', drawTop);
topTeSlider.addEventListener('input', drawTop);
topTiSlider.addEventListener('input', drawTop);
topTseToggle.addEventListener('change', drawTop);
topIrToggle.addEventListener('change', () => { updateControlStates(); drawTop(); });
topFatSatToggle.addEventListener('change', () => { updateControlStates(); drawTop(); });

// Event Listeners - Stage 2 Toggles
tseToggle.addEventListener('change', () => {
    if (!tseToggle.checked) {
        etlSlider.value = 1;
        etlValDisplay.innerText = '1';
    }
    updateControlStates();
    updateMetrics();
});

irToggle.addEventListener('change', () => {
    updateControlStates();
    updateMetrics();
});

fatSatToggle.addEventListener('change', () => {
    updateControlStates();
    updateMetrics();
});

// Spoiler Reveal Toggle for Metric Formulas
document.querySelectorAll('.metric-formula').forEach(formula => {
    formula.addEventListener('click', () => {
        formula.classList.toggle('revealed');
    });
});

// Student Guide Parameter Tabs Logic
const parameterExplanations = {
    tr: "<strong>Repetition Time (TR):</strong> The time between successive pulse sequence excitations. Controls T1 weighting. Long TRs (>2000ms) allow full T1 recovery, minimizing T1 contrast effects. Short TRs accentuate T1 differences between tissues.",
    te: "<strong>Echo Time (TE):</strong> The time between the initial RF excitation pulse and the peak of the echo. Controls T2 weighting. Long TEs (>80ms) let fast-decaying tissues (like muscle) fade out, leaving long-T2 fluids (like CSF) bright.",
    tse: "<strong>Turbo Spin Echo (TSE) & Echo Train Length (ETL):</strong> TSE collects multiple echoes per TR using multiple 180° refocusing pulses. ETL (the turbo factor) speeds up scan time linearly, but higher ETL increases RF energy deposition (SAR) and can cause T2 blurring. Increasing ETL also impacts SNR with an inverse relationship (NOTE: I have not coded T2 blurring or this SNR drop into the above simulator)",
    ir: "<strong>Inversion Recovery (IR) & Inversion Time (TI):</strong> Uses an initial 180° reversing pulse before excitation. By choosing a precise TI, specific tissues can be nulled—such as fat in STIR (short TI) or CSF in FLAIR (long TI).",
    chess: "<strong>Fat Saturation (CHESS):</strong> Uses a frequency-selective saturation pulse tuned precisely to the resonant frequency of fat protons before the main sequence, effectively suppressing fat signals.",
    wrap: "<strong>No Phase Wrap (Oversampling):</strong> Acquires extra phase-encoding steps outside the primary field of view to prevent anatomical folding (aliasing) artifacts from wrapping around to the opposite side of the image.",
    phase: "<strong>Phase Encoding Direction:</strong> Determines which axis of the image assigns spatial phase shifts. Changing this helps redirect motion artifacts or ghosting away from primary diagnostic areas of interest.",
    b0: "<strong>Field Strength (B₀):</strong> Measured in Tesla (e.g., 1.5T or 3.0T). Higher field strength increases baseline signal-to-noise ratio (SNR) and spatial resolution capability, but also amplifies magnetic susceptibility and chemical shift artifacts.",
    rbw: "<strong>Receiver Bandwidth (RBW):</strong> The frequency range sampled during readout. Higher RBW reduces chemical shift artifact and scan minimum TE (as information is sampled faster), but lets in more noise, lowering overall SNR.",
    thick: "<strong>Slice Thickness:</strong> Controls the volume dimension perpendicular to the image plane. Thicker slices boost SNR (more protons per voxel), while thinner slices reduce partial volume averaging and improve out-of-plane resolution.",
    matrix: "<strong>Matrix Size:</strong> The grid resolution (e.g., 256x256). Higher matrices decrease voxel volume, sharply improving spatial resolution at the direct expense of lowering SNR.",
    nsa: "<strong>Number of Signal Averages (NSA):</strong> Repeats the acquisition multiple times and averages the data. SNR increases proportional to the square root of NSA ($\sqrt{\text{NSA}}$), but scan time scales linearly."
};

const tabButtons = document.querySelectorAll('.tab-btn');
const tabContentPanel = document.getElementById('tabContentPanel');

function updateTabContent(paramKey) {
    if (tabContentPanel) {
        tabContentPanel.innerHTML = parameterExplanations[paramKey] || "Select a parameter tab above.";
    }
}

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateTabContent(btn.getAttribute('data-param'));
    });
});

updateControlStates();
updateMetrics();
updateTabContent('tr');