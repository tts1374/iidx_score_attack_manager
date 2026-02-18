import { describe, expect, it } from 'vitest';

import { OpfsStorage } from '../src/opfs.js';

class MemoryFileHandle {
  private bytes = new Uint8Array();
  private currentName: string;

  constructor(
    name: string,
    private readonly parent: MemoryDirectoryHandle,
    private readonly moveRequiresDirectoryArg: boolean,
  ) {
    this.currentName = name;
  }

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
      name: this.currentName,
    };
  }

  async move(destinationOrName: unknown, maybeName?: unknown) {
    if (this.moveRequiresDirectoryArg) {
      if (!(destinationOrName instanceof MemoryDirectoryHandle) || typeof maybeName !== 'string') {
        throw new TypeError("Failed to execute 'move' on 'FileSystemHandle': Not enough arguments");
      }
      if (destinationOrName !== this.parent) {
        throw new Error('cross-directory move is not supported in test handle');
      }
      this.parent.renameFile(this.currentName, maybeName, this);
      this.currentName = maybeName;
      return;
    }

    if (typeof destinationOrName !== 'string') {
      throw new TypeError("Failed to execute 'move' on 'FileSystemHandle': Not enough arguments");
    }
    this.parent.renameFile(this.currentName, destinationOrName, this);
    this.currentName = destinationOrName;
  }
}

class MemoryDirectoryHandle {
  private readonly directories = new Map<string, MemoryDirectoryHandle>();
  private readonly files = new Map<string, MemoryFileHandle>();

  constructor(private readonly moveRequiresDirectoryArg = false) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const found = this.directories.get(name);
    if (found) {
      return found;
    }
    if (options?.create) {
      const created = new MemoryDirectoryHandle(this.moveRequiresDirectoryArg);
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
      const created = new MemoryFileHandle(name, this, this.moveRequiresDirectoryArg);
      this.files.set(name, created);
      return created;
    }
    throw new Error('file not found');
  }

  renameFile(from: string, to: string, handle: MemoryFileHandle) {
    this.files.delete(from);
    this.files.set(to, handle);
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

  it('supports move() implementations that require destination directory + name arguments', async () => {
    const root = new MemoryDirectoryHandle(true);
    const storage = new TestOpfsStorage(root);

    await storage.writeFileAtomic('song_master/song_master.sqlite', new Uint8Array([9, 8, 7]));

    expect(await storage.fileExists('song_master/song_master.sqlite')).toBe(true);
    const bytes = await storage.readFile('song_master/song_master.sqlite');
    expect(Array.from(bytes)).toEqual([9, 8, 7]);
  });
});
