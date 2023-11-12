const SVGIcons2SVGFontStream = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');

/// https://github.com/fontello/svg2ttf/pull/120#issuecomment-1576957092
const sfnt= require('svg2ttf/lib/sfnt');
Object.defineProperty(sfnt.Font.prototype, "int_lineGap", { value: 0 });
/////////////

const lodash = require('lodash');
const fs = require('fs');
const Handlebars = require('handlebars');
const minimist = require('minimist');
const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');
const path = require('path');

const parts = [];
const icons = {};

const args = minimist(process.argv.slice(2));

const projectPath = args['project-path'];
const inputIconsDir = args['input-icons-dir'];
const outputCodepointsDir = args['output-codepoints-dir'];
const outputCodepointsFile = args['output-codepoints-file'];
const outputSvgDir = args['output-svg-dir'];
const outputSvgFile = args['output-svg-file'];
const outputFontDir = args['output-font-dir'];
const outputFontName = args['output-font-name'];
const outputClassDir = args['output-class-dir'];
const outputClassFile = args['output-class-file'];
const outputClassName = args['output-class-name'];
const outputPackageName = args['output-package-name'];
const iconNameReplacesIgnore = JSON.parse(args['icon-name-replaces-ignore']) || [];
const iconNameReplaces = JSON.parse(args['icon-name-replaces']);

// PATHS
const collectionJsonPath = path.join(projectPath, outputCodepointsDir, outputCodepointsFile + '.json');
const collectionSvgPath = path.join(projectPath, outputSvgDir, outputSvgFile + '.svg');
const svgsPath = path.join(projectPath, inputIconsDir);
const fontPath = path.join(projectPath, outputFontDir, outputFontName + '.ttf');
const dartClassPath = path.join(projectPath, outputClassDir, outputClassFile + '.dart');
const templatePath = path.join(__dirname, 'template.dart.hbs');

let metadata;

if (fs.existsSync(collectionJsonPath)) {
    metadata = JSON.parse(fs.readFileSync(collectionJsonPath, {
        encoding:'utf8',
        flag:'r',
    }));
} else {
    metadata = {};
}

const fontStream = new SVGIcons2SVGFontStream({
    fontId: outputClassName,
    fontName: outputClassName,
    fontHeight: 512,
    ascent: 512,
    descent: 0,
    fixedWidth: true,
    centerHorizontally: true,
    centerVertically: true,
    normalize: true,
});

fontStream.on('data', function(chunk) {
        parts.push(decoder.write(chunk));
    }).on('finish', onFinishCreateSVG).on('error', function (err) {
        console.log(err);
    });

const svgs = fs.readdirSync(svgsPath);
let index = metadata.count || 1;

console.log('Found ' + svgs.length + ' icons');

for (let i = 0; i < svgs.length; i++) {
    const svgName = svgs[i];
    let name = lodash.camelCase(svgName.replace('.svg', ''));

    if (!iconNameReplacesIgnore.includes(name)) {
        lodash.forEach(iconNameReplaces, (value, key) => {
            name = name.replace(key, value);
        });
    }

    const glyph = fs.createReadStream(path.join(svgsPath, svgName));
    const code = unicodeForIcon(name, metadata, index++);

    icons[name] = code;

    glyph.metadata = {
        unicode: [String.fromCodePoint(parseInt(code, 16))],
        name: name,
    };
    fontStream.write(glyph);
}

fontStream.end();

function onFinishCreateSVG() {
    const data = parts.join('');

    saveSvg(collectionSvgPath, data);
    createFont(fontPath, data);
    createDartClass(icons, outputClassName, outputPackageName);
    saveMetadataCollection(collectionJsonPath, metadata, icons);
}

function unicodeForIcon(name, metadata, index) {
    let code;

    if (metadata.icons && metadata.icons[name]) {
        code = metadata.icons[name];
    } else {
        code = unicode(index);
    }

    return code;
}

/**
 *
 * @param {number} num
 * @returns {string}
 */
function unicode(num) {
    let value = num.toString(16);
    while (value.length < 3) value = "0" + value;

    return 'E' + value;
}

/**
 *
 * @param path
 * @param svgFont
 */
function createFont(path, svgFont) {
    console.log('Creating TTF Font in: ' + path);

    const ttf = svg2ttf(svgFont);
    fs.writeFileSync(path, new Buffer.from(ttf.buffer));
}

/**
 *
 * @param path
 * @param data
 */
function saveSvg(path, data) {
    fs.writeFileSync(path, data, {encoding: 'utf8'});
}

function createDartClass(icons, className, packageName) {
    console.log('Creating Dart Class in: ' + dartClassPath);

    const templateContent = fs.readFileSync(templatePath, {
        encoding:'utf8',
        flag:'r',
    });

    const template = Handlebars.compile(templateContent);

    const content = template({
        className: className,
        packageName: packageName,
        icons: icons,
    });

    fs.writeFileSync(dartClassPath, content, {encoding: 'utf8'});
}

function saveMetadataCollection(path, metadata, icons) {
    console.log('Saving collection\'s metadata: ' + path);

    metadata.count = Object.keys(icons).length;
    metadata.icons = icons;
    fs.writeFileSync(path, JSON.stringify(metadata, null, 2), {encoding: 'utf8'});
}