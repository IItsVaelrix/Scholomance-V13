const fs = require('fs');

let coords = [];
let colors = [];
for (let i = 0; i < 32; i++) {
    colors.push('#' + i.toString(16).padStart(6, '0').toUpperCase());
}

let pair_count = 0;
for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 32; x++) {
        if (pair_count < 1161) {
            let color = colors[pair_count % 32];
            coords.push({x: x, y: y, color: color, partId: "holy_fire"});
            coords.push({x: 63 - x, y: y, color: color, partId: "holy_fire"});
            pair_count++;
        }
    }
}

let base_obj = {
    "schema": "pixelbrain.export.v1",
    "schemaVersion": "1.0.0",
    "format": "json",
    "material": "source",
    "coordinates": coords,
};

let prefixObj = Object.assign({}, base_obj);
let serializedObj = JSON.stringify(prefixObj);
let prefixStr = serializedObj.slice(0, -1) + ',"nonce":';

fs.writeFileSync('prefix.txt', prefixStr);
console.log("Wrote prefix.txt");
