const fs = require('fs');
const path = require('path');
const appDir = process.argv[2];
if (!appDir) throw new Error('请指定解包后的应用目录');
const parser = require(path.join(appDir, 'node_modules/@babel/parser'));
const translations = require('./补充翻译.json');
const scriptPath = path.join(appDir, 'dist/assets/index-RHAh9rwd.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const ast = parser.parse(source, {sourceType: 'module'});
const edits = [], counts = {};
function visit(node, parent) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'StringLiteral' || node.type === 'TemplateElement') {
    const value = node.type === 'StringLiteral' ? node.value : node.value.cooked;
    // Preserve property names, protocol values and import specifiers.
    const isKey = parent && ((parent.type === 'ObjectProperty' && parent.key === node)
      || ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.property === node));
    if (!isKey && Object.hasOwn(translations, value)) {
      const translated = translations[value];
      const text = node.type === 'StringLiteral' ? JSON.stringify(translated)
        : translated.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      edits.push({start: node.start, end: node.end, text});
      counts[value] = (counts[value] || 0) + 1;
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    if (Array.isArray(value)) value.forEach(child => visit(child, node));
    else if (value && typeof value === 'object') visit(value, node);
  }
}
visit(ast);
let result = source;
for (const edit of edits.sort((a,b) => b.start-a.start))
  result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
// Translate the displayed version label only; preserve the stored/API version.
const versionExpression = 'children:i?.metaData.gameVersion||""';
if (!result.includes(versionExpression)) throw new Error('无法定位主界面版本显示');
result = result.replace(versionExpression,
  'children:(i?.metaData.gameVersion||"").replace(/^Release\\b/,"正式版").replace(/^Beta\\b/,"测试版").replace(/^Alpha\\b/,"内测版")');
parser.parse(result, {sourceType: 'module'});
for (const key of [' Game Centre','LAUNCH GAME','Players online: ','News ','Launcher Info',
  'Version: ',' Open Launcher Folder','Repair game','Reinstall UE redist','Browse local files','Properties'])
  if (!counts[key]) throw new Error('缺少截图中的翻译项：' + key);
fs.writeFileSync(scriptPath, result);
fs.writeFileSync(path.join(appDir, '../translation-report.json'), JSON.stringify({edits: edits.length, counts}, null, 2));
console.log(JSON.stringify({edits: edits.length, distinct: Object.keys(counts).length, screenshotItemsVerified: true}));
