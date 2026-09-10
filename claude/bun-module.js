// Bun's 52-byte CompiledModuleGraphFile format, used by Claude Code 2.1.267.
// See docs/development.md for the upstream layout and the deliberate version limit.
const trailer = Buffer.from("\n---- Bun! ----\n");
const moduleSize = 52;

export function readBunGraph(binary) {
  const graphs = [];
  for (let end = binary.indexOf(trailer); end !== -1; end = binary.indexOf(trailer, end + 1)) {
    const metadata = end - 32;
    if (metadata < 0) continue;
    const size = Number(binary.readBigUInt64LE(metadata));
    if (!Number.isSafeInteger(size) || size <= 0 || size > metadata) continue;
    const start = metadata - size;
    const tableOffset = binary.readUInt32LE(metadata + 8);
    const tableLength = binary.readUInt32LE(metadata + 12);
    if (!tableLength || tableLength % moduleSize || tableOffset + tableLength > size) continue;
    const table = start + tableOffset;
    const flags = binary.readUInt32LE(metadata + 28);
    const count = tableLength / moduleSize;
    if (binary.readUInt32LE(metadata + 16) >= count) continue;
    // Unknown layout extensions (including prelinked graphs) need explicit support.
    if (flags & ~0x7ff) continue;
    if ((flags & 32) && tableOffset + tableLength + count * 4 > size) continue;
    const modules = [];
    for (let index = 0; index < count; index++) {
      const position = table + index * moduleSize;
      const fields = [];
      for (let field = 0; field < 48; field += 8) {
        const offset = binary.readUInt32LE(position + field);
        const length = binary.readUInt32LE(position + field + 4);
        if (offset + length > tableOffset) break;
        fields.push({ offset: start + offset, length });
      }
      if (fields.length !== 6) break;
      const [name, contents, sourcemap, bytecode, moduleInfo, bytecodeOrigin] = fields;
      if (!name.length || name.length > 4096) break;
      const moduleName = binary.subarray(name.offset, name.offset + name.length).toString("utf8");
      if (!moduleName.startsWith("/$bunfs/") || moduleName.includes("\0")) break;
      modules.push({ name: moduleName, position, index, fields, contents, sourcemap, bytecode, moduleInfo, bytecodeOrigin,
        encoding: binary[position + 48] });
    }
    if (modules.length === count) graphs.push({ start, metadata, table, tableLength, flags, modules });
  }
  if (graphs.length !== 1) throw new Error("Unsupported Bun binary layout; expected one validated module graph.");
  return graphs[0];
}

export function moduleSource(binary, module) {
  if (module.encoding !== 1) throw new Error("Unsupported composer encoding; expected Latin-1.");
  return binary.subarray(module.contents.offset, module.contents.offset + module.contents.length).toString("latin1");
}

/** Reuse the changed module's bytecode allocation; all executable sections keep their size. */
export function replaceModule(binary, graph, module, source) {
  const content = Buffer.from(source, "latin1");
  if (content.toString("latin1") !== source) throw new Error("Replacement must be Latin-1 encoded.");
  const space = module.bytecode;
  if (content.length + 1 > space.length) throw new Error("Not enough bytecode space for the composer patch.");
  // Validate ownership before reusing a byte range, including its NUL terminator.
  for (const item of graph.modules) {
    for (const field of item.fields) {
      if (field === space || !field.length) continue;
      if (space.offset < field.offset + field.length + 1 && space.offset + space.length > field.offset) {
        throw new Error("Composer bytecode storage overlaps another module field.");
      }
    }
  }
  const result = Buffer.from(binary);
  result.fill(0, space.offset, space.offset + space.length);
  content.copy(result, space.offset);
  result.writeUInt32LE(space.offset - graph.start, module.position + 8);
  result.writeUInt32LE(content.length, module.position + 12);
  // Clear stale source maps, bytecode, module info, and bytecode origin pointers.
  result.fill(0, module.position + 16, module.position + 48);
  if (graph.flags & 32) result.writeUInt32LE(0, graph.table + graph.tableLength + module.index * 4);
  // Source text is no longer contiguous after moving this module into its former bytecode.
  result.writeUInt32LE(graph.flags & ~16, graph.metadata + 28);
  return result;
}
