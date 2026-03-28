# 🌊 ALESKAT – Deep Sea Survival

**Un gioco di sopravvivenza negli abissi marini.** Guida il tuo lombrico marino bioluminescente, nutriti, cresci e non farti divorare.

![Game](https://img.shields.io/badge/PWA-Ready-00f5ff?style=flat-square) ![License](https://img.shields.io/badge/License-MIT-9b5de5?style=flat-square)

## 🎮 Gameplay

- **Muovi** il lombrico con il joystick virtuale (touch/mouse)
- **Nutriti** raccogliendo krill, meduse, uova di pesce e alghe
- **Cresci** ingurgitando cibo e plancton bioluminescente
- **Elimina** i nemici se sei abbastanza grande, altrimenti fuggili
- **Sopravvivi** monitorando l'energia — se scende a zero, muori
- La **profondità** aumenta con il tempo: l'oceano si fa più buio e pericoloso

## 🦠 Nemici

| Creatura | Comportamento | Pericolo |
|---|---|---|
| Pesce Lanterna | Aggressivo, ti insegue | Alto |
| Barracuda | Pattuglia | Medio |
| Lombrico Abissale | Aggressivo | Alto |
| Granchio | Lento, territoriale | Basso |

> **Strategia**: se il tuo lombrico è più lungo del nemico, puoi mangiarlo!

## 📱 PWA – Installazione

### GitHub Pages
1. Assicurati che in *Settings → Pages → Source* sia impostato su **GitHub Actions**
2. Il workflow `deploy.yml` si occupa del deploy automatico ad ogni push
3. Apri l'URL dal browser mobile e usa **"Aggiungi a schermata Home"**

### Locale
```bash
git clone https://github.com/pezzaliapp/ALESKAT.git
cd ALESKAT
python3 -m http.server 8080
# apri http://localhost:8080
```

## 🛠 Struttura

```
ALESKAT/
├── index.html        # Shell HTML
├── app.js            # Engine di gioco (Canvas 2D)
├── style.css         # UI & HUD
├── sw.js             # Service Worker (offline)
├── manifest.json     # PWA manifest
├── icon-192.png      # Icona PWA 192×192
├── icon-512.png      # Icona PWA 512×512
├── deploy.yml        # GitHub Actions → Pages
└── README.md
```

## 🎨 Tech Stack

- **Canvas 2D API** – rendering fluido a 60fps
- **PWA** – installabile, offline-ready
- **Zero dipendenze** – nessun framework, nessun bundler
- **Service Worker** – cache locale per uso offline

## 📄 License

MIT — by [PezzaliApp](https://pezzaliapp.com)
