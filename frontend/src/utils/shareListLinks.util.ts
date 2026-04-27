export function getShareListLinks(shareId: string) {
  const link = `${window.location.origin}/s/${shareId}`;

  return {
    link,
    filesJsonLink: `${link}/files.json`,
    filesTextLink: `${link}/files.txt`,
  };
}
