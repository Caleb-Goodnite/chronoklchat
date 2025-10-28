export function getFilesFromClipboardEvent(event: ClipboardEvent) {
  const dataTransferItems = event.clipboardData?.items;
  if (!dataTransferItems) return;
  const files = Array.from(dataTransferItems).reduce<File[]>((acc, item) => {
    const file = item.getAsFile();
    return file ? [...acc, file] : acc;
  }, []);
  return files.length ? files : undefined;
}

