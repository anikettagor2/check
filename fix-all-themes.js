const fs = require('fs');
const path = require('path');

function getFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const stat = fs.statSync(path.join(dir, file));
        if (stat.isDirectory()) {
            getFiles(path.join(dir, file), fileList);
        } else if (file.endsWith('.tsx')) {
            fileList.push(path.join(dir, file));
        }
    }
    return fileList;
}

const files = getFiles('src/app/dashboard/projects');

const replacements = [
    { from: /bg-\[\#0F1115\]/g, to: 'bg-background' },
    { from: /bg-\[\#050505\]/g, to: 'bg-background' },
    { from: /bg-\[\#161920\]/g, to: 'bg-card' },
    { from: /text-white/g, to: 'text-foreground' },
    { from: /border-white\/[0-9]+/g, to: 'border-border' },
    { from: /border-white\/\[0\.0[0-9]\]/g, to: 'border-border' },
    { from: /border-white\/\[0\.[0-9]+\]/g, to: 'border-border' },
    { from: /bg-white\/\[?0\.0[0-9]\]?/g, to: 'bg-muted/50' },
    { from: /bg-white\/[0-9]+/g, to: 'bg-muted' },
    { from: /text-zinc-[345678]00/g, to: 'text-muted-foreground' },
    { from: /bg-zinc-[678]00/g, to: 'bg-muted-foreground' },
    { from: /bg-black\/[0-9]+/g, to: 'bg-black/10 dark:bg-black/40' },
    { from: /fill-black/g, to: 'fill-primary' },
    { from: /text-black(?=[\s"'])/g, to: 'text-primary-foreground' },
    { from: /bg-white(?=[\s"'])/g, to: 'bg-primary ' },
    { from: /hover:bg-white\/\[?0\.0[0-9]\]?/g, to: 'hover:bg-accent' },
    { from: /hover:border-white\/[0-9]+/g, to: 'hover:border-border' },
    { from: /hover:text-white/g, to: 'hover:text-foreground' },
    { from: /divide-white\/[0-9]+/g, to: 'divide-border' },
    { from: /shadow-\[0_0_[0-9]+px_rgba\(255,255,255,0\.1\)\]/g, to: 'shadow-md shadow-primary/10' },
    { from: /bg-black(?=[\s"'])/g, to: 'bg-background' }
];

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;

    replacements.forEach(({ from, to }) => {
        content = content.replace(from, to);
    });

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Fixed', file);
    }
}
