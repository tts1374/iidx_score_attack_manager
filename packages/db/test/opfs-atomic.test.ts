import { describe, expect, it } from 'vitest';

import { OpfsStorage } from '../src/opfs.js';

class MemoryFileHandle {
  private bytes = new Uint8Array();

  constructor(private readonly name: string) {}

  async createWritable() {
    let next = this.bytes;
    return {
      write: async (value: Uint8Array) => {
        next = new Uint8Array(value);
      },
      close: async () => {
        this.bytes = next;
      },
    };
  }

  async getFile() {
    const current = this.bytes;
    return {
      arrayBuffer: async () => current.buffer.slice(current.byteOffset, current.byteOffset + current.byteLength),
      name: this.name,
    };
  }
}

class MemoryDirectoryHandle {
  private readonly directories = new Map<string, MemoryDirectoryHandle>();
  private readonly files = new Map<string, MemoryFileHandle>();

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const found = this.directories.get(name);
    if (found) {
      return found;
    }
    if (options?.create) {
      const created = new MemoryDirectoryHandle();
      this.directories.set(name, created);
      return created;
    }
    throw new Error('directory not found');
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const found = this.files.get(name);
    if (found) {
      return found;
    }
    if (options?.create) {
      const created = new MemoryFileHandle(name);
      this.files.set(name, created);
      return created;
    }
    throw new Error('file not found');
  }

  async removeEntry(name: string) {
    if (this.files.has(name)) {
      this.files.delete(name);
      return;
    }
    if (this.directories.has(name)) {
      this.directories.delete(name);
      return;
    }
    throw new Error('entry not found');
  }
}

class TestOpfsStorage extends OpfsStorage {
  constructor(private readonly root: MemoryDirectoryHandle) {
    super();
  }

  override async getRoot(): Promise<FileSystemDirectoryHandle> {
    return this.root as unknown as FileSystemDirectoryHandle;
  }
}

describe('OpfsStorage atomic write', () => {
  it('writes tmp then replaces target', async () => {
    const root = new MemoryDirectoryHandle();
    const storage = new TestOpfsStorage(root);

    await storage.writeFileAtomic('evidences/t1/1.jpg', new Uint8Array([1, 2, 3]), {
      validate: async (bytes) => {
        expect(Array.from(bytes)).toEqual([1, 2, 3]);
      },
    });

    expect(await storage.fileExists('evidences/t1/1.jpg')).toBe(true);
    const bytes = await storage.readFile('evidences/t1/1.jpg');
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });
});
