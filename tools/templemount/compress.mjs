import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt, reorder, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { MeshoptEncoder } from 'meshoptimizer';
const [inp, out] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
let tex = 0; for (const t of doc.getRoot().listTextures()) tex += t.getImage().byteLength;
console.log('textures in', (tex / 1048576).toFixed(1), 'Mo,', doc.getRoot().listTextures().length);
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), dedup(), weld(), reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }), prune());
await io.write(out, doc);

let t2=0; for (const t of doc.getRoot().listTextures()) t2 += t.getImage().byteLength; console.log('textures out', (t2/1048576).toFixed(1), 'Mo');
