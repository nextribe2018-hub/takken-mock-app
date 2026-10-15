# Web版（Claudeアーティファクト）一覧

`python3 web/univ/build.py` で `web/univ/<id>.html` を作り、Artifact ツールで同じファイルを publish すると下の URL が更新される（別の会話からは `url` を指定）。capabilities は db・user。
立教は `web/rikkyo/`、慶應は `web/keio/`、宅建は `web/` 。共通テンプレートは `web/exam-template.html`。

問題数は 2026-10-15 の統合（`docs/content/INTEGRATION.md`）後の `src/data` の数。公開中のページは統合前の版のままなので、各 URL に再 publish して更新する。

## 大学入試・税理士

| id | 問題数 | 過去問ベース | URL |
|---|---|---|---|
| `kindai-nihonshi` | 300 | 143 | https://claude.ai/artifact/Ee6zAk4pUQtiSzKd15ZJbR |
| `kindai-sekaishi` | 300 | 136 | https://claude.ai/artifact/Fviwt1QsYuvaMaoSt2vQaN |
| `kindai-eigo` | 260 | 117 | https://claude.ai/artifact/Mzrjcy714iNHNfWNkmaBYo |
| `kindai-kokugo` | 260 | 79 | https://claude.ai/artifact/WFisHye6gXGCxiCJT9z6Xr |
| `nichidai-nihonshi` | 300 | 139 | https://claude.ai/artifact/661bJ9TM3nrHd6k3UxaC8H |
| `nichidai-sekaishi` | 300 | 145 | https://claude.ai/artifact/LqDopEjwkuAaxPVBEXMwYQ |
| `nichidai-eigo` | 260 | 120 | https://claude.ai/artifact/PZUkKnCbUhz72sKzi143Lp |
| `nichidai-kokugo` | 260 | 66 | https://claude.ai/artifact/5hbVUHDtihjuPvdh4nNRzX |
| `meiji-nihonshi` | 300 | 70 | https://claude.ai/artifact/C3LqyK2Y9BN3Wrk4HisTzV |
| `meiji-sekaishi` | 300 | 70 | https://claude.ai/artifact/BLKrPtzgWbS5mDuYnE37za |
| `meiji-eigo` | 260 | 53 | https://claude.ai/artifact/2XG3hyPiVdKqH64QWe7tqw |
| `meiji-kokugo` | 260 | 62 | https://claude.ai/artifact/YZbcG2VBg8ruZ5AeaLj2vo |
| `zeirishi-zaihyo` | 599 | 285 | https://claude.ai/artifact/CVD7XPnJPbNCpTygLkSd4L |
| `zeirishi-souzoku` | 600 | 223 | https://claude.ai/artifact/Vej7vSWRrpFQJJ4fL4CTPQ |
| `zeirishi-shouhi` | 599 | 216 | https://claude.ai/artifact/4uEUFimic5TUaVG6LvidJL |
| `zeirishi-shotoku` | 600 | 227 | https://claude.ai/artifact/R4z6eEPpbHF84bLWrE5tCV |
| `todai-eigo` | 260 | 0 | https://claude.ai/artifact/Hjchh8gRcfXZZccBeSYLhM |
| `todai-chiri` | 260 | 90 | https://claude.ai/artifact/Um7QqcLmr8i6NZZ1Cmidnk |
| `todai-seibutsu` | 260 | 48 | https://claude.ai/artifact/WqLWSSFaKe3vdcSeUPoqbw |
| `waseda-eigo` | 120 | 0 | https://claude.ai/artifact/7tpcob8K8ppHDX1dpBbATw |
| `todai-kokugo` | 260 | 46 | https://claude.ai/artifact/QT4LFPTV8tteM2SLwX4N9E |
| `todai-sugaku-bun` | 260 | 64 | https://claude.ai/artifact/925rVGJjXS33K3opHNBvMZ |
| `todai-sugaku-ri` | 256 | 70 | https://claude.ai/artifact/UxL9BJUUDossS74XRJMnaH |
| `todai-butsuri` | 260 | 88 | https://claude.ai/artifact/B37oWrkyt9HsowZCkM2i4r |
| `todai-kagaku` | 260 | 113 | https://claude.ai/artifact/5zmBB984tD5trgKMXKDoe5 |
| `todai-nihonshi` | 300 | 102 | https://claude.ai/artifact/JhqjaFiZaSfY3DCEMB1HbN |
| `waseda-nihonshi` | 200 | 0 | https://claude.ai/artifact/RYe7d9JLQ2i5bWKAFm7Wkm |
| `waseda-sekaishi` | 200 | 0 | https://claude.ai/artifact/YSTuDD2r4vHEsAWsMrcqpt |
| `waseda-kokugo` | 120 | 0 | https://claude.ai/artifact/72fpcZTCkTbgwXVwBXSv4A |
| `zeirishi-boki` | 600 | 246 | https://claude.ai/artifact/EQUepUHRpBqkYywD6KMin6 |
| `zeirishi-houjin` | 600 | 196 | https://claude.ai/artifact/5svegi4HDdsJmhaRdpknYA |
| `todai-sekaishi` | 300 | 121 | https://claude.ai/artifact/VKhh2Q8SMCqvuD8NWM9wwK |

## 慶應（`python3 web/keio/build.py`）

| id | 問題数 | 過去問ベース | URL |
|---|---|---|---|
| `keio-econ-sekaishi` | 200 | 70 | https://claude.ai/artifact/GoSJjP3YVK2UghMf2XmVaM |
| `keio-econ-nihonshi` | 200 | 74 | https://claude.ai/artifact/K9EQSvDxbpBECbKff27czm |
| `keio-comm-sekaishi` | 200 | 70 | https://claude.ai/artifact/3T9H7sWHVAQQMp5XWgu3iR |
| `keio-comm-nihonshi` | 200 | 70 | https://claude.ai/artifact/KMUHyD9Hzowni6YEaiwoEF |

## 資格試験

介護福祉士・社会福祉士の「過去問ベース」の列は、原文のまま載せた過去問題の数（`fix: true` で選択肢の順も原文どおり。社会福祉振興・試験センターの条件）。

| id | 問題数 | 過去問ベース | URL |
|---|---|---|---|
| `itpass-all` | 300 | 262 | https://claude.ai/artifact/L2iKrttkXW9nUtf8gVwAoV |
| `fe-kamokua` | 300 | 220 | https://claude.ai/artifact/AzyNyxngzffTGQXNQc2a4Q |
| `sg-all` | 500 | 329 | https://claude.ai/artifact/WW6NdtgXtNPNBVeE1xt7aw |
| `kikenbutsu-otsu4` | 300 | 0 | https://claude.ai/artifact/4fHc3PkoMbjdnkgUTqsyrj |
| `denko2-gakka` | 594 | 439 | https://claude.ai/artifact/3DYZwnEJCW1oYL8DjdgBPu |
| `denko1-gakka` | 390 | 352 | https://claude.ai/artifact/NduUuJjF8hMGnCLWEEnfqC |
| `eisei-ichi` | 300 | 255 | https://claude.ai/artifact/DD1EVU92e5pQgBo5aJLgtt |
| `eisei-ni` | 300 | 224 | https://claude.ai/artifact/QMjyh2k7bZ553Gm3HBX6vA |
| `tohan-all` | 300 | 279 | https://claude.ai/artifact/2VhkBkV1Gf41LGGmsk8W5Y |
| `kanri-all` | 700 | 496 | https://claude.ai/artifact/VBvVyBoVMczNaBMVUjHPpV |
| `fp-san` | 698 | 369 | https://claude.ai/artifact/2V1sE9SP6yVDu2VSZmRxVk |
| `fp-ni` | 700 | 506 | https://claude.ai/artifact/PE3qkZVq8ZizRsz17Ajk8t |
| `boiler2-all` | 200 | 182 | https://claude.ai/artifact/75Fzbh3wS4N84Bv5QHoiF5 |
| `kango-all` | 439 | 320 | https://claude.ai/artifact/AiSqs9V2BMBC9719QFKLsB |
| `boki-san` | 500 | 0 | https://claude.ai/artifact/XAZGPQjT1bJZQVHbHTJh6e |
| `boki-ni` | 500 | 0 | https://claude.ai/artifact/GHwMCcDn8wFQcC1pQAc9ya |
| `mankan-all` | 500 | 377 | https://claude.ai/artifact/NkTNM1Bse5BYK9arRUVPBX |
| `chintai-all` | 500 | 350 | https://claude.ai/artifact/5D2uuUoAswQoHPceHKwGzt |
| `sharoushi-all` | 500 | 210 | https://claude.ai/artifact/KMuyEFftTZHFspvUA2uoJ5 |
| `gyosei-all` | 500 | 306 | https://claude.ai/artifact/HhnjJdtqYgAxXZJ93tTicn |
| `denken3-riron` | 100 | 81 | https://claude.ai/artifact/311ucRRBqYMBdVKZD6ML1k |
| `denken3-denryoku` | 100 | 85 | https://claude.ai/artifact/PoLVwJUobFoDEb6QhUxwGp |
| `denken3-kikai` | 100 | 88 | https://claude.ai/artifact/FaGfSVh9o79rnKQm5DLDPL |
| `denken3-houki` | 100 | 77 | https://claude.ai/artifact/L53GNXbQbDSW5emdpaoFyk |
| `kaigo-all` | 609 | 369 | https://claude.ai/artifact/452joheaiZka5eQV3Yq34S |
| `shakai-all` | 178 | 178 | https://claude.ai/artifact/9eL6cNVu5Mqa6dFge96JKK |
| `ouyou-tech` | 120 | 60 | https://claude.ai/artifact/TpsJYMp9AvAuwe6wBM3HhB |
| `ouyou-mgmt` | 120 | 60 | https://claude.ai/artifact/7uLp1YD3MEeAdxxkoSex4r |
| `kashikin-all` | 120 | 0 | https://claude.ai/artifact/1EegCvRKWnZxAiwA2CoprN |

## 高校受験

| id | 問題数 | 過去問ベース | URL |
|---|---|---|---|
| `koukou-nankan-rekishi` | 200 | 0 | https://claude.ai/artifact/VLd2LijByiRr4LJEmUADc2 |
| `koukou-nankan-chiri` | 120 | 0 | https://claude.ai/artifact/WYCwfiEXPfPLntQZGn4v7J |
| `koukou-nankan-koumin` | 120 | 0 | https://claude.ai/artifact/8JxZJGPNQPeRZLJeLZHEDC |
| `koukou-nankan-rika` | 120 | 0 | https://claude.ai/artifact/EGNQ2igL2eF2P8TqKxL5L3 |
| `koukou-nankan-eigo` | 120 | 0 | https://claude.ai/artifact/HfNEmqnuAFG6MhEDWR8dk6 |
| `koukou-nankan-kokugo` | 120 | 0 | https://claude.ai/artifact/FMf7fSiwPz7RFkXdNdUyRu |
| `koukou-nankan-sugaku` | 120 | 0 | https://claude.ai/artifact/38tBTuJF1Xp9Htym4KSi9r |
| `koukou-rekishi` | 200 | 0 | https://claude.ai/artifact/4Dg5Sji8i5NmY5P2RHGw4V |
| `koukou-chiri` | 120 | 0 | https://claude.ai/artifact/9hyXij67QnF71D4K7f1QtD |
| `koukou-koumin` | 120 | 0 | https://claude.ai/artifact/8CE679aVjfM3bsMTJ3B2g3 |
| `koukou-rika` | 120 | 0 | https://claude.ai/artifact/2LT3z8BWvL2yrLtLSNnbbT |
| `koukou-eigo` | 120 | 0 | https://claude.ai/artifact/JaW521p4wh61k8nraDqGWC |
| `koukou-kokugo` | 120 | 0 | https://claude.ai/artifact/44mbVgcLaC3Vv2nLjPA82w |
| `koukou-sugaku` | 120 | 0 | https://claude.ai/artifact/9jJZyWubFs7jbK83UP3ajN |

## 中学受験

| id | 問題数 | 過去問ベース | URL |
|---|---|---|---|
| `chugaku-nankan-rekishi` | 200 | 0 | https://claude.ai/artifact/R9Lie2HdHURbcMvCfXFCCu |
| `chugaku-nankan-chiri` | 120 | 0 | https://claude.ai/artifact/RkQies5eQxupET5pmLUDYp |
| `chugaku-nankan-koumin` | 120 | 0 | https://claude.ai/artifact/FMo5meLfjihmd5ksyYZdsj |
| `chugaku-nankan-rika` | 120 | 0 | https://claude.ai/artifact/PmYxmNCePvuoQjfF5Kp8g1 |
| `chugaku-nankan-kokugo` | 120 | 0 | https://claude.ai/artifact/CUSQSfE2Ckcc9c2C3oz6Ps |
| `chugaku-nankan-sansu` | 120 | 0 | https://claude.ai/artifact/QCkwnGim4LvosGuF2pjSA2 |
| `chugaku-fuzoku-rekishi` | 200 | 0 | https://claude.ai/artifact/942ApMiHgqoEZ2v776rYVF |
| `chugaku-fuzoku-chiri` | 120 | 0 | https://claude.ai/artifact/NSQtqHSwujyFcksSapgCT5 |
| `chugaku-fuzoku-koumin` | 120 | 0 | https://claude.ai/artifact/6R79NvXot7AVYs2ptGcDkC |
| `chugaku-fuzoku-rika` | 120 | 0 | https://claude.ai/artifact/Y7NGFw4wEzksVVQy9dYqQP |
| `chugaku-fuzoku-kokugo` | 120 | 0 | https://claude.ai/artifact/37em6KnZVcXnyiqk24UaYv |
| `chugaku-fuzoku-sansu` | 120 | 0 | https://claude.ai/artifact/JaSkQYHnUVqbHdYpBUHWAg |
| `chugaku-rekishi` | 200 | 0 | https://claude.ai/artifact/Ah94zUtcS9kUXigegyiGUY |
| `chugaku-chiri` | 120 | 0 | https://claude.ai/artifact/SZahdFehCxj1d8BCTNN1W3 |
| `chugaku-koumin` | 120 | 0 | https://claude.ai/artifact/TBzZTna4pdFRTh8Kd2u6kG |
| `chugaku-rika` | 120 | 0 | https://claude.ai/artifact/4dc73fZUUUjNhEki4x3pWj |
| `chugaku-kokugo` | 120 | 0 | https://claude.ai/artifact/QPKkcg8fockX4rLRSyvNc1 |
| `chugaku-sansu` | 120 | 0 | https://claude.ai/artifact/4rgwC5UnGTZJc4w1b2jfqh |

## 統合済み（旧URL）

同じ試験を複数のセッションが別々に作ったため、1セットにまとめた。下の旧ページは更新しない（問題は統合先に含まれる）。

| 旧id | 統合先 | 旧URL |
|---|---|---|
| `fp-2kyu` | `fp-ni` | https://claude.ai/artifact/KdzqzfEY2x2jc5JknajGvh |
| `fp-3kyu` | `fp-san` | https://claude.ai/artifact/72KUqkwyDbP95Z1eg43gUB |
| `denko2-all` | `denko2-gakka` | https://claude.ai/artifact/W8FzgiP3pG2Ua5mbCNHXtc |
| `denko1-all` | `denko1-gakka` | https://claude.ai/artifact/3iqs4o9axKHiE5fdjEko8k |
| `sg-kamokua` | `sg-all` | https://claude.ai/artifact/LJvkJyFakHE9f8Ww2dHzHD |
| `kanrigyo-all` | `kanri-all` | https://claude.ai/artifact/WQ3pUuqBPe1jUdifbpyyxR |
| `kango-kiso` | `kango-all` | https://claude.ai/artifact/C7F6yW2Na4UJwnRjEGvTa6 |
| `kango-rinsho` | `kango-all` | https://claude.ai/artifact/8joGhJwDqRoCUiAX26aB7V |
| `kaigo-ningen` | `kaigo-all` | https://claude.ai/artifact/5CkXvMvK4zTB5qGv82aQZe |
| `kaigo-kaigo` | `kaigo-all` | https://claude.ai/artifact/NzMUh3hpxsszEqhWcqQVZ4 |
