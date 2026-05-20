const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const imagesDir = path.join(rootDir, 'images');
const indexFile = path.join(rootDir, 'index.html');
const allowedExtensions = /\.(jpe?g|png|webp|gif)$/i;

function readString(view, offset, length) {
    let str = '';
    for (let i = 0; i < length; i += 1) {
        const char = view.getUint8(offset + i);
        if (char === 0) break;
        str += String.fromCharCode(char);
    }
    return str.trim();
}

function formatRational(value) {
    if (!value) return null;
    if (typeof value === 'object') {
        const { numerator, denominator } = value;
        if (!denominator || denominator === 0) return null;
        if (numerator === 0) return '0';
        if (numerator / denominator >= 1) {
            return (numerator / denominator).toFixed(1).replace(/\.0$/, '');
        }
        return `${numerator}/${denominator}`;
    }
    return value.toString();
}

function formatAperture(value) {
    const formatted = formatRational(value);
    return formatted ? `f/${formatted}` : '-';
}

function formatShutter(value) {
    if (!value) return '-';
    if (typeof value === 'object') {
        const { numerator, denominator } = value;
        if (!denominator || denominator === 0) return '-';
        return `${numerator}/${denominator}s`;
    }
    return `${value}s`;
}

function readValue(view, type, count, offset, little, tiffStart) {
    const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const length = typeSizes[type] * count;
    const valueOffset = length > 4 ? tiffStart + view.getUint32(offset, little) : offset;

    switch (type) {
        case 1:
        case 7:
            if (count === 1) return view.getUint8(valueOffset);
            return Array.from({ length: count }, (_, i) => view.getUint8(valueOffset + i));
        case 2:
            return readString(view, valueOffset, count - 1);
        case 3:
            if (count === 1) return view.getUint16(valueOffset, little);
            return Array.from({ length: count }, (_, i) => view.getUint16(valueOffset + i * 2, little));
        case 4:
            if (count === 1) return view.getUint32(valueOffset, little);
            return Array.from({ length: count }, (_, i) => view.getUint32(valueOffset + i * 4, little));
        case 5:
            if (count === 1) {
                return {
                    numerator: view.getUint32(valueOffset, little),
                    denominator: view.getUint32(valueOffset + 4, little),
                };
            }
            return Array.from({ length: count }, (_, i) => ({
                numerator: view.getUint32(valueOffset + i * 8, little),
                denominator: view.getUint32(valueOffset + i * 8 + 4, little),
            }));
        case 9:
            if (count === 1) return view.getInt32(valueOffset, little);
            return Array.from({ length: count }, (_, i) => view.getInt32(valueOffset + i * 4, little));
        case 10:
            if (count === 1) {
                return {
                    numerator: view.getInt32(valueOffset, little),
                    denominator: view.getInt32(valueOffset + 4, little),
                };
            }
            return Array.from({ length: count }, (_, i) => ({
                numerator: view.getInt32(valueOffset + i * 8, little),
                denominator: view.getInt32(valueOffset + i * 8 + 4, little),
            }));
        default:
            return null;
    }
}

function readIFD(view, tiffStart, dirStart, little) {
    if (dirStart + 2 > view.byteLength) return {};
    const entries = view.getUint16(dirStart, little);
    const tags = {};

    for (let i = 0; i < entries; i += 1) {
        const entryOffset = dirStart + 2 + i * 12;
        if (entryOffset + 12 > view.byteLength) break;
        const tag = view.getUint16(entryOffset, little);
        const type = view.getUint16(entryOffset + 2, little);
        const count = view.getUint32(entryOffset + 4, little);
        const valueOffset = entryOffset + 8;
        tags[tag] = readValue(view, type, count, valueOffset, little, tiffStart);
    }

    return tags;
}

function readTiff(view, start) {
    const little = view.getUint16(start) === 0x4949;
    const offset = view.getUint32(start + 4, little);
    const tags = readIFD(view, start, start + offset, little);

    if (tags[0x8769]) {
        Object.assign(tags, readIFD(view, start, start + tags[0x8769], little));
    }

    return tags;
}

function parseExif(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
        const marker = view.getUint16(offset);
        const length = view.getUint16(offset + 2);
        if (marker === 0xFFE1) {
            const exifHeader = offset + 4;
            if (readString(view, exifHeader, 4) !== 'Exif') return null;
            return readTiff(view, exifHeader + 6);
        }
        offset += 2 + length;
    }

    return null;
}

function normalizeFilename(filename) {
    return filename.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

function formatDate(value) {
    if (!value) return '';
    return value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1.$2.$3');
}

function extractMetadata(filePath) {
    try {
        const tags = parseExif(fs.readFileSync(filePath));
        if (!tags) return null;

        const camera = [tags[0x010F], tags[0x0110]].filter(Boolean).join(' ').trim();
        const lens = tags[0xA434] || (tags[0xA405] ? `${tags[0xA405]}mm` : '-');
        const aperture = formatAperture(tags[0x829D]);
        const shutter = formatShutter(tags[0x829A]);
        const iso = tags[0x8827] || '-';
        const date = formatDate(tags[0x9003] || tags[0x9004] || tags[0x0132]);

        return {
            camera: camera || 'Sem metadados disponíveis',
            lens,
            aperture,
            shutter,
            iso,
            date,
        };
    } catch (error) {
        return null;
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderCard(filename, index) {
    const src = `images/${filename}`;
    const title = normalizeFilename(filename) || `Foto ${index + 1}`;
    const metadata = extractMetadata(path.join(imagesDir, filename)) || {
        camera: 'Sem metadados disponíveis',
        lens: '-',
        aperture: '-',
        shutter: '-',
        iso: '-',
        date: '',
    };

    return `                <article class="photo-card" tabindex="0" data-src="${escapeHtml(src)}" data-title="${escapeHtml(title)}" data-date="${escapeHtml(metadata.date)}" data-camera="${escapeHtml(metadata.camera)}" data-lens="${escapeHtml(metadata.lens)}" data-aperture="${escapeHtml(metadata.aperture)}" data-shutter="${escapeHtml(metadata.shutter)}" data-iso="${escapeHtml(metadata.iso)}">
                    <img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy" />
                    <div class="photo-meta">
                        <h3>${escapeHtml(title)}</h3>
                        <p>Imagem ${index + 1} da galeria.</p>
                    </div>
                </article>`;
}

function generateGallery() {
    const files = fs
        .readdirSync(imagesDir)
        .filter((file) => allowedExtensions.test(file))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return files.map(renderCard).join('\n');
}

const html = fs.readFileSync(indexFile, 'utf8');
const galleryHtml = generateGallery();
const nextHtml = html.replace(
    /<!-- gallery:start -->[\s\S]*?<!-- gallery:end -->/,
    `<!-- gallery:start -->\n${galleryHtml}\n                <!-- gallery:end -->`,
);

if (nextHtml === html) {
    console.log('Galeria já está atualizada.');
} else {
    fs.writeFileSync(indexFile, nextHtml);
    console.log('Galeria atualizada em index.html.');
}
