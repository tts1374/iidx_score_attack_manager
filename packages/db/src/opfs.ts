export interface AtomicWriteOptions {
  validate?: (bytes: Uint8Array) => Promise<void>;
}

export function buildAtomicTempFileName(fileName: string, nonce: string): string {
  return `${fileName}.tmp.${nonce}`;
}

function splitPath(relativePath: string): string[] {
  return relativePath
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = Uint8Array.from(bytes);
  return copy.buffer;
}

function isLockedMoveError(error: unknown): boolean {
  const message = String(error ?? '');
  return message.includes('cannot be moved to a destination which is locked');
}

function isMoveSignatureError(error: unknown): boolean {
  const message = String(error ?? '').toLowerCase();
  return (
    message.includes('not enough arguments') ||
    message.includes('arguments required') ||
    message.includes('failed to execute \'move\'')
  );
}

function isMoveUnsupportedError(error: unknown): boolean {
  const message = String(error ?? '').toLowerCase();
  return message.includes('not supported');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class OpfsStorage {
  async getRoot(): Promise<FileSystemDirectoryHandle> {
    if (!navigator.storage?.getDirectory) {
      throw new Error('OPFS is not supported.');
    }
    return navigator.storage.getDirectory();
  }

  private async ensureDirectory(pathParts: string[]): Promise<FileSystemDirectoryHandle> {
    let current = await this.getRoot();
    for (const part of pathParts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
    return current;
  }

  private async getDirectory(pathParts: string[]): Promise<FileSystemDirectoryHandle> {
    let current = await this.getRoot();
    for (const part of pathParts) {
      current = await current.getDirectoryHandle(part);
    }
    return current;
  }

  private async moveFileHandleCompat(
    handle: FileSystemFileHandle,
    destinationDir: FileSystemDirectoryHandle,
    destinationName: string,
  ): Promise<void> {
    const moveFn = (handle as unknown as { move?: (...args: unknown[]) => Promise<void> }).move;
    if (typeof moveFn !== 'function') {
      throw new Error('move() is unavailable');
    }

    try {
      await moveFn.call(handle, destinationName);
      return;
    } catch (error) {
      if (!isMoveSignatureError(error)) {
        throw error;
      }
    }

    await moveFn.call(handle, destinationDir, destinationName);
  }

  async writeFile(relativePath: string, bytes: Uint8Array): Promise<void> {
    const parts = splitPath(relativePath);
    if (parts.length === 0) {
      throw new Error('Invalid path');
    }

    const fileName = parts.pop()!;
    const dir = await this.ensureDirectory(parts);
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(toArrayBuffer(bytes));
    await writable.close();
  }

  async writeFileAtomic(relativePath: string, bytes: Uint8Array, options: AtomicWriteOptions = {}): Promise<void> {
    const parts = splitPath(relativePath);
    if (parts.length === 0) {
      throw new Error('Invalid path');
    }

    const fileName = parts.pop()!;
    const dir = await this.ensureDirectory(parts);
    const tmpName = buildAtomicTempFileName(fileName, crypto.randomUUID());

    const tmpHandle = await dir.getFileHandle(tmpName, { create: true });
    const writable = await tmpHandle.createWritable();
    await writable.write(toArrayBuffer(bytes));
    await writable.close();

    if (options.validate) {
      const validated = await this.readFile([...parts, tmpName].join('/'));
      await options.validate(validated);
    }

    const moveFn = (tmpHandle as unknown as { move?: (...args: unknown[]) => Promise<void> }).move;
    if (typeof moveFn === 'function') {
      let lastError: unknown;
      let shouldFallbackToCopy = false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          await dir.removeEntry(fileName);
        } catch {
          // ignore (not found or locked). move() result decides retry.
        }

        try {
          await this.moveFileHandleCompat(tmpHandle, dir, fileName);
          return;
        } catch (error) {
          lastError = error;
          if (isMoveUnsupportedError(error)) {
            shouldFallbackToCopy = true;
            break;
          }
          if (!isLockedMoveError(error) || attempt === 5) {
            if (isMoveSignatureError(error)) {
              shouldFallbackToCopy = true;
              break;
            }
            throw error;
          }
          await sleep(80 * (attempt + 1));
        }
      }

      if (!shouldFallbackToCopy) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
    }

    // Fallback if move() is unavailable: copy then remove temp.
    const tmpFile = await tmpHandle.getFile();
    const copied = new Uint8Array(await tmpFile.arrayBuffer());
    const targetHandle = await dir.getFileHandle(fileName, { create: true });
    const targetWritable = await targetHandle.createWritable();
    await targetWritable.write(toArrayBuffer(copied));
    await targetWritable.close();
    await dir.removeEntry(tmpName);
  }

  async readFile(relativePath: string): Promise<Uint8Array> {
    const parts = splitPath(relativePath);
    const fileName = parts.pop();
    if (!fileName) {
      throw new Error('Invalid path');
    }

    const dir = await this.getDirectory(parts);
    const handle = await dir.getFileHandle(fileName);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async fileExists(relativePath: string): Promise<boolean> {
    const parts = splitPath(relativePath);
    const fileName = parts.pop();
    if (!fileName) {
      return false;
    }

    try {
      const dir = await this.getDirectory(parts);
      await dir.getFileHandle(fileName);
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(relativePath: string): Promise<void> {
    const parts = splitPath(relativePath);
    const fileName = parts.pop();
    if (!fileName) {
      return;
    }

    try {
      const dir = await this.getDirectory(parts);
      await dir.removeEntry(fileName);
    } catch {
      // ignore
    }
  }

  async deleteDirectory(relativePath: string): Promise<void> {
    const parts = splitPath(relativePath);
    const directoryName = parts.pop();
    if (!directoryName) {
      return;
    }

    try {
      const parent = await this.getDirectory(parts);
      await parent.removeEntry(directoryName, { recursive: true });
    } catch {
      // ignore
    }
  }

  async readImageBitmap(relativePath: string): Promise<ImageBitmap> {
    const bytes = await this.readFile(relativePath);
    const blob = new Blob([toArrayBuffer(bytes)], { type: 'image/jpeg' });
    return createImageBitmap(blob);
  }
}
