# RotaFlow — PRD

## Original problem statement
O usuário pediu a reconstrução completa de um módulo de mapas e navegação inspirado no Google Maps: Google Maps JavaScript API (vetorial, 3D, câmera suave, marcadores personalizados), Google Routes API (rotas reais, trânsito, alternativas, pedágios, trechos), otimização de paradas, navegação GPS própria (próxima manobra, desvio, recálculo, pausar/retomar, próxima parada, visão geral), animações com Framer Motion, desktop + mobile (painel inferior), backend FastAPI + Pydantic com as chaves protegidas no servidor, cache de geocodificação, limite de requisições, autorização por técnico, base operacional centralizada. Chave: GOOGLE_MAPS_API_KEY.
Escolhas do usuário: "Somente crie o mapa, ignore toda a questão de OS. Quero um clone maps"; login por e-mail e senha (depois pediu cadastro aberto também); base: Rua Descalvado 636, Renascença, Belo Horizonte; todas as 6 fases. Nunca chamar o testing agent — o usuário testa sozinho.

## Architecture
- Backend FastAPI: core.py (db, JWT, bcrypt, rate limit, BaseDocument), auth_routes.py (login/register/refresh/logout/me, admin users), maps_routes.py (/config, /routes/geocode, /routes/autocomplete com fallback para Geocoding, /routes/place/{id}, /routes/compute-route, /routes/nav-leg), itinerary_routes.py (CRUD de roteiros por dono, start, complete/reopen stop, proteção contra duplicadas).
- Base geocodificada no backend a partir de BASE_ADDRESS (.env), com cache no Mongo — única fonte de verdade.
- Frontend React (JS): MapCanvas (vetorial, mapId), useMapOverlays (rota com desenho progressivo + trânsito, alternativas, pins, veículo suavizado + câmera seguindo), useGpsSource (watchPosition suavizado + simulador), useNavigator (projeção na rota, manobras, desvio confirmado em 3 leituras), useNavigationSession (recálculo com cooldown de 20s, chegada, voz, wake lock), usePlanner.

## Implemented (2026-10-31)
- Login + cadastro aberto (função técnico), admin seedado (troin595@gmail.com), gerenciamento de técnicos.
- Busca de endereços, paradas arrastáveis, otimização de ordem (Routes API optimizeWaypointOrder), rotas reais com trânsito/pedágio/alternativas, comparação de alternativas por trecho, roteiros salvos + recuperação de roteiro em andamento.
- Navegação: banner de manobra, distância, ETA, progresso, pausar/retomar, próxima parada, visão geral/recentralizar, desvio → recálculo, chegada + concluir parada, voz pt-BR, modo simulação (1x/2x/5x, simular desvio).
- Layout desktop (painel lateral) e mobile (bottom sheet com 3 alturas).

## Known limitations
- Places API (New) não está ativada na chave → sugestões vêm da Geocoding API (funciona, mas menos rica).
- GOOGLE_MAPS_MAP_ID="DEMO_MAP_ID": inclinação 3D/rotação da câmera exigem um Map ID vetorial próprio criado no Google Cloud.

## Backlog
- P1: Map ID vetorial próprio; ativar Places API (New).
- P1: Restringir a chave por domínio (HTTP referrer) no Google Cloud.
- P2: Planejamento de frota (vários técnicos) via Route Optimization API.
- P2: Acompanhamento em tempo real do técnico pelo admin (WebSocket).
