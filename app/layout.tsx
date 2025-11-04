export const metadata = { title: 'Validador (Canvas)', description: 'Detecta 4 quadrados' };

export default function RootLayout(
  { children }: { children: React.ReactNode }) {
  return (
    <html lang='pt-br'>
      <body style={{ fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
