import { exec } from 'child_process';

export function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    command = `open "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.log(`  Open this URL in your browser:\n  ${url}`);
    }
  });
}
