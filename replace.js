const fs = require('fs');
const files = [
    'src/app/dashboard/components/admin-dashboard.tsx',
    'src/app/dashboard/components/project-manager-dashboard.tsx',
    'src/app/dashboard/components/sales-dashboard.tsx',
    'src/app/dashboard/projects/[id]/page.tsx'
];

files.forEach(f => {
    let s = fs.readFileSync(f, 'utf8');

    // Make sure AvatarImage is imported
    if (s.includes('AvatarFallback') && !s.includes('AvatarImage')) {
        s = s.replace(/AvatarFallback/g, 'AvatarImage, AvatarFallback');
    }

    // Replace <div className="..."> { displayName?.[0] } </div> for divs
    // Not easy via script for divs without risking breakages. Let's do AvatarFallback first.

    s = s.replace(/(<Avatar[^>]*>\s*)(<AvatarFallback[^>]*>\{([a-zA-Z0-9_?.()]+)displayName\?\.\[0\].*?\}<\/AvatarFallback>)(\s*<\/Avatar>)/g, (match, prefix, fallback, variable, suffix) => {
        let varName = variable.replace(/[\?\.()]/g, '');
        return `${prefix}<AvatarImage src={${varName}.photoURL || undefined} className="object-cover" />\n\t\t\t\t\t\t\t\t\t\t\t\t${fallback}${suffix}`;
    });

    s = s.replace(/(<Avatar[^>]*>\s*)(<AvatarFallback[^>]*>\s*\{([a-zA-Z0-9_?.()]+)displayName\?\.\[0\]?(?:\.toUpperCase\(\))? \|\| ['"]U['"]\}\s*<\/AvatarFallback>)(\s*<\/Avatar>)/g, (match, prefix, fallback, variable, suffix) => {
        let varName = variable.replace(/[\?\.()]/g, '');
        return `${prefix}<AvatarImage src={${varName}.photoURL || undefined} className="object-cover" />\n\t\t\t\t\t\t\t\t\t\t\t\t${fallback}${suffix}`;
    });

    fs.writeFileSync(f, s);
});
