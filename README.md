# E Suite · QR

Dynamic + static QR codes with UTM attachment and scan tracking. One deployment per client.
Spec: see the "QR Code Generator + Scan Analytics: Build Spec" doc.

```
npm install
npm run db:migrate && npm run db:seed   # local PGlite, seeds BEC + test slug "demo7"
npm run dev -w apps/qr                  # http://localhost:3000/demo7
npm test
```
