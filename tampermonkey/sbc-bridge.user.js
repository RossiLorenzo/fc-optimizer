// ==UserScript==
// @name         FC SBC Bridge
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Bridges FC SBC Optimizer with EA Web App - SID sync + challenge detection + one-click SBC push
// @author       Lorenzo Rossi
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*
// @match        http://localhost:*/*
// @match        https://*.onrender.com/*
// @match        https://*.herokuapp.com/*
// @match        https://*.vercel.app/*
// @match        https://*.netlify.app/*
// @match        https://*.github.io/*
// @icon         https://www.ea.com/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// ==/UserScript==

// NOTE: Add your production URL to @match above if not covered.

(function() {
    'use strict';

    var isEA = location.hostname === 'www.ea.com';
    var EA_API = 'https://utas.mob.v5.prd.futc-ext.gcp.ea.com/ut/game/fc26';

    // =========================================================================
    // EA SIDE — runs on www.ea.com
    // =========================================================================
    if (isEA) {

        var POLL_INTERVAL = 2000;
        var MAX_ATTEMPTS = 120;

        // --- Helpers ---

        function getSID() {
            try { return unsafeWindow.services.Authentication.getUtasSession().id; }
            catch (e) { return null; }
        }

        // --- Club Cache ---
        // Intercepts EA's own club fetches to avoid re-fetching during push.
        // EA paginates POST /club with 90 items/page on every app load — we piggyback on that.
        var clubCache = {}; // id -> {id, assetId, rating, rareflag, ...}
        var clubCacheTimestamp = 0;
        var CLUB_CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

        function addToClubCache(items) {
            var added = 0;
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (!clubCache[item.id]) { clubCache[item.id] = item; added++; }
            }
            if (added > 0) {
                clubCacheTimestamp = Date.now();
                console.log('[SBC Bridge] Club cache: +' + added + ', total=' + Object.keys(clubCache).length);
            }
        }

        function isClubCacheFresh() {
            return Object.keys(clubCache).length > 0 && (Date.now() - clubCacheTimestamp) < CLUB_CACHE_MAX_AGE;
        }

        function findInClubCache(assetId, rating, count) {
            var results = [];
            var ids = Object.keys(clubCache);
            for (var i = 0; i < ids.length; i++) {
                var item = clubCache[ids[i]];
                if (item.assetId === assetId && item.rating === rating) {
                    results.push({ id: item.id, rareflag: item.rareflag || 0 });
                    if (results.length >= count) break;
                }
            }
            return results;
        }

        // Bulk-fetch the entire club (used when cache is empty/stale at push time)
        async function fetchFullClub() {
            var sid = getSID();
            if (!sid) return;
            var headers = { 'X-UT-SID': sid, 'Content-Type': 'application/json' };
            var start = 0;
            console.log('[SBC Bridge] Bulk-fetching club...');
            while (true) {
                var resp = await fetch(EA_API + '/club', {
                    method: 'POST', headers: headers, referrer: 'https://www.ea.com/',
                    body: JSON.stringify({
                        type: 'player', count: 91, start: start,
                        ovrMin: 1, ovrMax: 99, sort: 'desc', sortBy: 'ovr', searchAltPositions: true
                    }),
                    mode: 'cors', credentials: 'omit'
                });
                if (!resp.ok) { console.warn('[SBC Bridge] Club fetch failed at start=' + start); break; }
                var data = await resp.json();
                var items = data.itemData || [];
                if (items.length === 0) break;
                addToClubCache(items);
                start += items.length;
            }
            console.log('[SBC Bridge] Club fully cached: ' + Object.keys(clubCache).length + ' items');
        }

        // Handle intercepted club POST responses
        function handleClubResponse(data) {
            if (data && data.itemData && data.itemData.length > 0) {
                addToClubCache(data.itemData);
            }
        }

        // --- Inventory Cache ---
        // Intercepts EA's own tradepile/storage/duplicated fetches and broadcasts to optimizer.
        // This lets the optimizer show player data without making its own API calls.
        var inventoryCache = {
            tradepile: null,   // {auctionInfo: [...]}
            storage: null,     // {itemData: [...]}
            duplicated: null,  // {itemData: [...]}
            timestamp: 0
        };

        function handleTradepileResponse(data) {
            if (data && data.auctionInfo) {
                inventoryCache.tradepile = data;
                inventoryCache.timestamp = Date.now();
                broadcastInventory();
                console.log('[SBC Bridge] Tradepile cached: ' + data.auctionInfo.length + ' items');
            }
        }

        function handleStorageResponse(data) {
            if (data && data.itemData) {
                inventoryCache.storage = data;
                inventoryCache.timestamp = Date.now();
                broadcastInventory();
                console.log('[SBC Bridge] Storage cached: ' + data.itemData.length + ' items');
            }
        }

        function handleDuplicatedResponse(data) {
            if (data && data.itemData) {
                inventoryCache.duplicated = data;
                inventoryCache.timestamp = Date.now();
                broadcastInventory();
                console.log('[SBC Bridge] Duplicated cached: ' + data.itemData.length + ' items');
            }
        }

        function broadcastInventory() {
            GM_setValue('sbc_inventory', JSON.stringify({
                tradepile: inventoryCache.tradepile,
                storage: inventoryCache.storage,
                duplicated: inventoryCache.duplicated,
                timestamp: Date.now()
            }));
        }

        // --- SBC Sets Cache ---
        var sbcSetsCache = null; // raw response from /sbs/sets

        function handleSetsResponseAndBroadcast(data) {
            handleSetsResponse(data);
            if (data && data.categories) {
                sbcSetsCache = data;
                GM_setValue('sbc_sets_data', JSON.stringify({ data: data, timestamp: Date.now() }));
                console.log('[SBC Bridge] SBC sets cached and broadcast');
            }
        }

        // --- SID Display ---

        function createSIDDisplay(sid) {
            var container = document.createElement('div');
            container.id = 'ut-sid-display';
            container.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:12px;padding:4px 8px;background:rgba(0,0,0,0.3);border-radius:4px;font-size:11px;font-family:monospace;color:#aaa;vertical-align:middle';

            var label = document.createElement('span');
            label.textContent = 'SID:';
            label.style.color = '#888';

            var sidText = document.createElement('span');
            sidText.textContent = sid;
            sidText.style.cssText = 'color:#4fc3f7;user-select:all';

            var copyBtn = document.createElement('button');
            copyBtn.textContent = '\u{1F4CB}';
            copyBtn.title = 'Copy SID to clipboard';
            copyBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:3px;padding:2px 6px;cursor:pointer;font-size:10px;transition:background 0.2s';
            copyBtn.addEventListener('mouseenter', function() { copyBtn.style.background = 'rgba(255,255,255,0.2)'; });
            copyBtn.addEventListener('mouseleave', function() { copyBtn.style.background = 'rgba(255,255,255,0.1)'; });
            copyBtn.addEventListener('click', function() {
                navigator.clipboard.writeText(sid).then(function() {
                    var orig = copyBtn.textContent;
                    copyBtn.textContent = '\u2713';
                    copyBtn.style.color = '#4caf50';
                    setTimeout(function() { copyBtn.textContent = orig; copyBtn.style.color = ''; }, 1500);
                }).catch(function() {
                    copyBtn.textContent = '\u2717';
                    copyBtn.style.color = '#f44336';
                });
            });

            container.appendChild(label);
            container.appendChild(sidText);
            container.appendChild(copyBtn);
            return container;
        }

        function tryInjectSID(attempts) {
            attempts = attempts || 0;
            if (attempts >= MAX_ATTEMPTS) return;

            if (typeof unsafeWindow.services === 'undefined' ||
                typeof unsafeWindow.services.Authentication === 'undefined' ||
                typeof unsafeWindow.services.Authentication.getUtasSession !== 'function') {
                setTimeout(function() { tryInjectSID(attempts + 1); }, POLL_INTERVAL);
                return;
            }

            var session = unsafeWindow.services.Authentication.getUtasSession();
            if (!session || !session.id) {
                setTimeout(function() { tryInjectSID(attempts + 1); }, POLL_INTERVAL);
                return;
            }

            var h1 = document.querySelector('h1.title');
            if (!h1) {
                setTimeout(function() { tryInjectSID(attempts + 1); }, POLL_INTERVAL);
                return;
            }

            if (document.getElementById('ut-sid-display')) return;

            h1.parentNode.insertBefore(createSIDDisplay(session.id), h1.nextSibling);
            GM_setValue('sbc_ea_sid', session.id + '|' + Date.now());
            console.log('[SBC Bridge] SID injected and broadcast:', session.id);
        }

        // --- SBC Challenge Detection ---

        var setNameCache = {};
        var challengeCache = {};
        var currentChallengeId = null;

        function broadcastCurrentChallenge() {
            if (!currentChallengeId) return;
            var meta = challengeCache[currentChallengeId] || {};
            GM_setValue('sbc_current_challenge', JSON.stringify({
                challengeId: currentChallengeId,
                challengeName: meta.name || 'Challenge ' + currentChallengeId,
                formation: meta.formation || '',
                setName: (meta.setId && setNameCache[meta.setId]) || 'SBC',
                timestamp: Date.now()
            }));
        }

        function broadcastSquadPlayers(squadData) {
            try {
                var players = squadData && squadData.squad && squadData.squad.players || [];
                var placed = [];
                for (var i = 0; i < players.length; i++) {
                    var p = players[i];
                    if (p.itemData && p.itemData.id > 0 && p.itemData.assetId) {
                        placed.push({ assetId: p.itemData.assetId, rating: p.itemData.rating });
                    }
                }
                GM_setValue('sbc_squad_players', JSON.stringify({ players: placed, timestamp: Date.now() }));
            } catch (e) { /* ignore */ }
        }

        function fetchSquadAndBroadcast(challengeId) {
            var sid = getSID();
            if (!sid || !challengeId) return Promise.resolve();
            return fetch(EA_API + '/sbs/challenge/' + challengeId + '/squad', {
                headers: { 'X-UT-SID': sid }, referrer: 'https://www.ea.com/'
            }).then(function(r) { return r.json(); }).then(function(data) {
                broadcastSquadPlayers(data);
            }).catch(function() {});
        }

        // --- Shared response handlers (used by both XHR and fetch interceptors) ---

        function handleSetsResponse(data) {
            if (!data || !data.categories) return;
            for (var c = 0; c < data.categories.length; c++) {
                var cat = data.categories[c];
                if (cat.sets) {
                    for (var s = 0; s < cat.sets.length; s++) {
                        setNameCache[cat.sets[s].setId] = cat.sets[s].name;
                    }
                }
            }
        }

        function handleChallengesResponse(data, setId) {
            if (!data || !data.challenges) return;
            for (var i = 0; i < data.challenges.length; i++) {
                var ch = data.challenges[i];
                challengeCache[ch.challengeId] = { name: ch.name, formation: ch.formation, setId: setId };
            }
        }

        function handleSquadGet(challengeId, squadData) {
            currentChallengeId = challengeId;
            broadcastCurrentChallenge();
            if (squadData) broadcastSquadPlayers(squadData);
        }

        function handleSquadPut(challengeId) {
            fetchSquadAndBroadcast(challengeId);
        }

        // URL pattern matchers
        function matchSetId(url) {
            var m = url.match(/\/sbs\/setId\/(\d+)\/challenges/);
            return m ? parseInt(m[1]) : null;
        }

        function matchChallengeId(url) {
            var m = url.match(/\/sbs\/challenge\/(\d+)\/squad/);
            return m ? parseInt(m[1]) : null;
        }

        // --- Intercept XHR ---

        var origXHROpen = XMLHttpRequest.prototype.open;
        var origXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._sbcUrl = url;
            this._sbcMethod = method;
            return origXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function() {
            var self = this;
            var url = self._sbcUrl || '';

            if (typeof url === 'string') {
                // Intercept club POST responses to populate cache
                var xhrMethod = (self._sbcMethod || 'GET').toUpperCase();
                if (url.indexOf('/club') !== -1 && xhrMethod === 'POST' && url.indexOf('/club/') === -1) {
                    self.addEventListener('load', function() {
                        try { handleClubResponse(JSON.parse(self.responseText)); } catch (e) {}
                    });
                }

                // Intercept inventory responses (tradepile, storage, duplicated)
                if (xhrMethod === 'GET') {
                    if (url.indexOf('/tradepile') !== -1) {
                        self.addEventListener('load', function() {
                            try { handleTradepileResponse(JSON.parse(self.responseText)); } catch (e) {}
                        });
                    }
                    if (url.indexOf('/storagepile') !== -1) {
                        self.addEventListener('load', function() {
                            try { handleStorageResponse(JSON.parse(self.responseText)); } catch (e) {}
                        });
                    }
                    if (url.indexOf('/purchased/items') !== -1) {
                        self.addEventListener('load', function() {
                            try { handleDuplicatedResponse(JSON.parse(self.responseText)); } catch (e) {}
                        });
                    }
                }

                if (url.indexOf('/sbs/sets') !== -1) {
                    self.addEventListener('load', function() {
                        try { handleSetsResponseAndBroadcast(JSON.parse(self.responseText)); } catch (e) {}
                    });
                }

                var setId = matchSetId(url);
                if (setId !== null) {
                    self.addEventListener('load', function() {
                        try { handleChallengesResponse(JSON.parse(self.responseText), setId); } catch (e) {}
                    });
                }

                var challengeId = matchChallengeId(url);
                if (challengeId !== null) {
                    var method = (self._sbcMethod || 'GET').toUpperCase();
                    if (method === 'GET') {
                        self.addEventListener('load', function() {
                            try { handleSquadGet(challengeId, JSON.parse(self.responseText)); } catch (e) {
                                handleSquadGet(challengeId, null);
                            }
                        });
                    } else if (method === 'PUT') {
                        self.addEventListener('load', function() { handleSquadPut(challengeId); });
                    }
                }
            }

            return origXHRSend.apply(this, arguments);
        };

        // --- Intercept fetch ---

        // Safe JSON parse from a cloned response — returns null on empty/non-JSON bodies
        function safeCloneJson(resp) {
            var cloned = resp.clone();
            return cloned.text().then(function(text) {
                if (!text || !text.trim()) return null;
                try { return JSON.parse(text); } catch (e) { return null; }
            });
        }

        var origFetch = unsafeWindow.fetch;
        if (origFetch) {
            unsafeWindow.fetch = function(input, init) {
                var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                var method = (init && init.method ? init.method : 'GET').toUpperCase();
                var promise = origFetch.apply(this, arguments);

                if (typeof url === 'string') {
                    // Intercept club POST responses to populate cache
                    if (url.indexOf('/club') !== -1 && method === 'POST' && url.indexOf('/club/') === -1) {
                        promise.then(safeCloneJson)
                            .then(function(data) { if (data) handleClubResponse(data); }).catch(function() {});
                    }

                    // Intercept inventory responses
                    if (method === 'GET') {
                        if (url.indexOf('/tradepile') !== -1) {
                            promise.then(safeCloneJson)
                                .then(function(data) { if (data) handleTradepileResponse(data); }).catch(function() {});
                        }
                        if (url.indexOf('/storagepile') !== -1) {
                            promise.then(safeCloneJson)
                                .then(function(data) { if (data) handleStorageResponse(data); }).catch(function() {});
                        }
                        if (url.indexOf('/purchased/items') !== -1) {
                            promise.then(safeCloneJson)
                                .then(function(data) { if (data) handleDuplicatedResponse(data); }).catch(function() {});
                        }
                    }

                    if (url.indexOf('/sbs/sets') !== -1) {
                        promise.then(safeCloneJson)
                            .then(function(data) { if (data) handleSetsResponseAndBroadcast(data); }).catch(function() {});
                    }

                    var setId = matchSetId(url);
                    if (setId !== null) {
                        promise.then(safeCloneJson)
                            .then(function(data) { if (data) handleChallengesResponse(data, setId); }).catch(function() {});
                    }

                    var challengeId = matchChallengeId(url);
                    if (challengeId !== null) {
                        if (method === 'GET') {
                            promise.then(safeCloneJson)
                                .then(function(data) { handleSquadGet(challengeId, data); })
                                .catch(function() { handleSquadGet(challengeId, null); });
                        } else if (method === 'PUT') {
                            promise.then(function() { handleSquadPut(challengeId); }).catch(function() {});
                        }
                    }
                }

                return promise;
            };
        }

        // --- Challenge detection from app state ---

        function findChallengeInVC(vc) {
            if (!vc) return null;
            if (vc._challenge && vc._challenge.id) return vc._challenge.id;
            if (vc._challengeId) return vc._challengeId;
            if (vc._presentedViewController) {
                var r = findChallengeInVC(vc._presentedViewController);
                if (r) return r;
            }
            var children = vc._childViewControllers || vc.childViewControllers || [];
            for (var i = children.length - 1; i >= 0; i--) {
                var r = findChallengeInVC(children[i]);
                if (r) return r;
            }
            return null;
        }

        function detectChallengeFromApp() {
            try {
                var sbcService = unsafeWindow.services && unsafeWindow.services.SBC;
                if (sbcService) {
                    var squads = sbcService.getCachedSBCSquads && sbcService.getCachedSBCSquads();
                    if (squads && squads.length > 0) {
                        var chId = squads[0].challengeId || (squads[0]._challenge && squads[0]._challenge.id);
                        if (chId) {
                            currentChallengeId = chId;
                            broadcastCurrentChallenge();
                            fetchSquadAndBroadcast(chId);
                            return true;
                        }
                    }
                }
                var app = unsafeWindow.getAppMain && unsafeWindow.getAppMain();
                if (app) {
                    var rootVC = app.getRootViewController && app.getRootViewController();
                    var found = findChallengeInVC(rootVC);
                    if (found) {
                        currentChallengeId = found;
                        broadcastCurrentChallenge();
                        fetchSquadAndBroadcast(found);
                        return true;
                    }
                }
            } catch (e) {}
            return false;
        }

        // --- GM value change listeners ---

        GM_addValueChangeListener('sbc_request_challenge_refresh', function(name, oldVal, newVal, remote) {
            if (!remote) return;
            if (!detectChallengeFromApp() && currentChallengeId) broadcastCurrentChallenge();
        });

        GM_addValueChangeListener('sbc_request_sid_refresh', function(name, oldVal, newVal, remote) {
            if (!remote) return;
            var sid = getSID();
            if (sid) GM_setValue('sbc_ea_sid', sid + '|' + Date.now());
        });

        GM_addValueChangeListener('sbc_push_command', function(name, oldValue, newValue, remote) {
            if (!remote) return;
            try { executePush(JSON.parse(newValue)); } catch (e) {}
        });

        // --- SBC Push Execution ---

        // Formation -> slot positions (0-10 starting XI, 11+ subs)
        var FORMATION_SLOTS = {
            'f3142':  ['GK','CB','CB','CB','CDM','CM','CM','LM','RM','ST','ST'],
            'f3412':  ['GK','CB','CB','CB','LM','CM','CM','RM','CAM','ST','ST'],
            'f343':   ['GK','CB','CB','CB','LM','CM','CM','RM','LW','ST','RW'],
            'f3421':  ['GK','CB','CB','CB','LM','CM','CM','RM','LW','ST','RW'],
            'f3511':  ['GK','CB','CB','CB','LM','CDM','CM','CM','RM','CAM','ST'],
            'f352':   ['GK','CB','CB','CB','LM','CDM','CDM','RM','CAM','ST','ST'],
            'f41212': ['GK','LB','CB','CB','RB','CDM','LM','RM','CAM','ST','ST'],
            'f41212-2':['GK','LB','CB','CB','RB','CDM','CM','CM','CAM','ST','ST'],
            'f4132':  ['GK','LB','CB','CB','RB','CDM','CM','CM','CM','ST','ST'],
            'f4141':  ['GK','LB','CB','CB','RB','CDM','LM','CM','CM','RM','ST'],
            'f4222':  ['GK','LB','CB','CB','RB','CDM','CDM','CAM','CAM','ST','ST'],
            'f4231':  ['GK','LB','CB','CB','RB','CDM','CDM','CAM','CAM','CAM','ST'],
            'f4231-2':['GK','LB','CB','CB','RB','CDM','CDM','LM','CAM','RM','ST'],
            'f424':   ['GK','LB','CB','CB','RB','CM','CM','LW','RW','ST','ST'],
            'f4312':  ['GK','LB','CB','CB','RB','CM','CM','CM','CAM','ST','ST'],
            'f4321':  ['GK','LB','CB','CB','RB','CM','CM','CM','LW','ST','RW'],
            'f433':   ['GK','LB','CB','CB','RB','CM','CM','CM','LW','ST','RW'],
            'f433-2': ['GK','LB','CB','CB','RB','CDM','CM','CM','LW','ST','RW'],
            'f433-3': ['GK','LB','CB','CB','RB','CDM','CM','CAM','LW','ST','RW'],
            'f433-4': ['GK','LB','CB','CB','RB','CM','CM','CAM','LW','ST','RW'],
            'f433-5': ['GK','LB','CB','CB','RB','CDM','CDM','CAM','LW','ST','RW'],
            'f442':   ['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST'],
            'f442-2': ['GK','LB','CB','CB','RB','LM','CDM','CDM','RM','ST','ST'],
            'f4411':  ['GK','LB','CB','CB','RB','LM','CM','CM','RM','CAM','ST'],
            'f4411-2':['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST'],
            'f451':   ['GK','LB','CB','CB','RB','LM','CM','CM','CM','RM','ST'],
            'f451-2': ['GK','LB','CB','CB','RB','LM','CDM','CM','CM','RM','ST'],
            'f5212':  ['GK','LB','CB','CB','CB','RB','CM','CM','CAM','ST','ST'],
            'f5221':  ['GK','LB','CB','CB','CB','RB','CM','CM','LW','ST','RW'],
            'f532':   ['GK','LB','CB','CB','CB','RB','CM','CM','CM','ST','ST'],
            'f541':   ['GK','LB','CB','CB','CB','RB','LM','CM','CM','RM','ST'],
        };

        var POS_COMPAT = {
            'GK':['GK'], 'CB':['CB'], 'LB':['LB','LM','CB'], 'RB':['RB','RM','CB'],
            'CDM':['CDM','CM','CB'], 'CM':['CM','CDM','CAM'], 'CAM':['CAM','CM','CF','ST'],
            'LM':['LM','LW','LB','CM'], 'RM':['RM','RW','RB','CM'],
            'LW':['LW','LM','ST','CAM'], 'RW':['RW','RM','ST','CAM'],
            'ST':['ST','CF','CAM','LW','RW'], 'CF':['CF','ST','CAM'],
        };

        async function executePush(cmd) {
            function sendResult(result) {
                result.commandId = cmd.commandId;
                GM_setValue('sbc_push_result', JSON.stringify(result));
            }

            try {
                var sid = cmd.sid || getSID();
                if (!sid) { sendResult({ success: false, error: 'No SID available.' }); return; }

                var squadUrl = EA_API + '/sbs/challenge/' + cmd.challengeId + '/squad';
                var slotData = cmd.slotData;

                // Build unique player search list
                var countByKey = {};
                var playerSearches = [];
                for (var s in slotData) {
                    var key = slotData[s].a + '_' + slotData[s].r;
                    if (!countByKey[key]) {
                        countByKey[key] = 0;
                        playerSearches.push({ key: key, assetId: slotData[s].a, rating: slotData[s].r });
                    }
                    countByKey[key]++;
                }

                // Use club cache if fresh, otherwise bulk-fetch once
                if (!isClubCacheFresh()) {
                    sendResult({ success: true, status: 'searching', message: 'Loading club (' + Object.keys(clubCache).length + ' cached)...' });
                    await fetchFullClub();
                } else {
                    console.log('[SBC Bridge] Using cached club data (' + Object.keys(clubCache).length + ' items)');
                }

                sendResult({ success: true, status: 'searching', message: 'Matching ' + playerSearches.length + ' players from cache...' });

                // Look up all players from cache — zero additional API calls
                var candidates = {};
                for (var pi = 0; pi < playerSearches.length; pi++) {
                    var ps = playerSearches[pi];
                    candidates[ps.key] = findInClubCache(ps.assetId, ps.rating, countByKey[ps.key]);
                }

                // Sort by rareflag (prefer base cards), resolve to item IDs
                var found = {};
                for (var ck in candidates) {
                    candidates[ck].sort(function(a, b) { return a.rareflag - b.rareflag; });
                    found[ck] = candidates[ck].map(function(c) { return c.id; });
                }

                // Map each slot to a club item ID
                var playerItems = [];
                var used = {};
                var missing = [];
                for (var s in slotData) {
                    var key = slotData[s].a + '_' + slotData[s].r;
                    var idx = used[key] || 0;
                    if (found[key] && found[key][idx]) {
                        playerItems.push({ id: found[key][idx], positions: slotData[s].p || [] });
                        used[key] = idx + 1;
                    } else {
                        missing.push((slotData[s].nm || slotData[s].a) + ' (' + slotData[s].r + ')');
                    }
                }
                if (missing.length > 0) {
                    sendResult({ success: false, error: 'Not in club: ' + missing.join(', ') + '. Move from transfer list first.' });
                    return;
                }

                sendResult({ success: true, status: 'placing', message: 'Placing ' + playerItems.length + ' players...' });

                // GET current squad
                var getResp = await fetch(squadUrl, { headers: { 'X-UT-SID': sid }, referrer: 'https://www.ea.com/' });
                var currentSquad = await getResp.json();
                var players = currentSquad.squad.players.map(function(p) {
                    return { index: p.index, itemData: { id: p.itemData.id, dream: false } };
                });

                // Find empty slots
                var emptySlots = [];
                for (var pi = 0; pi < players.length; pi++) {
                    if (!players[pi].itemData.id || players[pi].itemData.id <= 0) emptySlots.push(pi);
                }

                if (emptySlots.length < playerItems.length) {
                    sendResult({ success: false, error: 'Not enough free slots. Need ' + playerItems.length + ', have ' + emptySlots.length + '.' });
                    return;
                }

                // Position-aware placement
                var formation = currentSquad.squad.formation || '';
                var slotPositions = FORMATION_SLOTS[formation] || null;
                var emptySlotInfo = emptySlots.map(function(si) {
                    return { slotIdx: si, position: (slotPositions && si < slotPositions.length) ? slotPositions[si] : null };
                });

                var assigned = {};
                var unassigned = playerItems.slice();

                // Pass 1: exact match, Pass 2: compatible match
                if (slotPositions) {
                    for (var pass = 0; pass < 2; pass++) {
                        var stillUnassigned = [];
                        for (var ui = 0; ui < unassigned.length; ui++) {
                            var player = unassigned[ui];
                            var bestSlot = -1;
                            for (var ei = 0; ei < emptySlotInfo.length; ei++) {
                                var slot = emptySlotInfo[ei];
                                if (assigned[slot.slotIdx] !== undefined || !slot.position) continue;
                                if (pass === 0) {
                                    if (player.positions.indexOf(slot.position) !== -1) { bestSlot = ei; break; }
                                } else {
                                    var compat = POS_COMPAT[slot.position] || [];
                                    for (var ci = 0; ci < player.positions.length; ci++) {
                                        if (compat.indexOf(player.positions[ci]) !== -1) { bestSlot = ei; break; }
                                    }
                                    if (bestSlot !== -1) break;
                                }
                            }
                            if (bestSlot !== -1) {
                                assigned[emptySlotInfo[bestSlot].slotIdx] = player.id;
                            } else {
                                stillUnassigned.push(player);
                            }
                        }
                        unassigned = stillUnassigned;
                    }
                }

                // Pass 3: remaining go into any empty slot
                for (var ui = 0; ui < unassigned.length; ui++) {
                    for (var ei = 0; ei < emptySlotInfo.length; ei++) {
                        if (assigned[emptySlotInfo[ei].slotIdx] === undefined) {
                            assigned[emptySlotInfo[ei].slotIdx] = unassigned[ui].id;
                            break;
                        }
                    }
                }

                for (var si in assigned) {
                    players[parseInt(si)].itemData.id = assigned[si];
                }

                // PUT squad
                var putResp = await fetch(squadUrl, {
                    headers: { 'Content-Type': 'application/json', 'X-UT-SID': sid },
                    referrer: 'https://www.ea.com/',
                    body: JSON.stringify({ players: players }),
                    method: 'PUT', mode: 'cors', credentials: 'omit'
                });
                if (!putResp.ok) { sendResult({ success: false, error: 'PUT failed: ' + putResp.status }); return; }

                // GET final squad
                var getResp2 = await fetch(squadUrl, { headers: { 'X-UT-SID': sid }, referrer: 'https://www.ea.com/' });
                var finalData = await getResp2.json();
                broadcastSquadPlayers(finalData);

                // Update EA app UI
                var filledPlayers = finalData.squad.players.filter(function(p) { return p.itemData.id > 0; });
                var added = 0;
                var uiUpdated = false;
                try {
                    var factory = new unsafeWindow.UTItemEntityFactory();
                    var squad = unsafeWindow.services.SBC.getCachedSBCSquads()[0];
                    if (squad) {
                        for (var j = 0; j < filledPlayers.length; j++) {
                            squad.addItemToSlot(filledPlayers[j].index, factory.createItem(filledPlayers[j].itemData));
                            added++;
                        }
                        uiUpdated = true;
                    }
                } catch (e) {}

                // Remove used players from club cache so they can't be double-used
                for (var asi in assigned) {
                    var usedId = assigned[asi];
                    delete clubCache[usedId];
                }
                console.log('[SBC Bridge] Removed ' + Object.keys(assigned).length + ' used players from club cache, remaining: ' + Object.keys(clubCache).length);

                sendResult({
                    success: true, status: 'done',
                    message: added + ' players placed. Rating: ' + (finalData.squad.rating || 0) + ', Chemistry: ' + (finalData.squad.chemistry || 0) + (uiUpdated ? '' : ' (refresh page to see changes)'),
                    rating: finalData.squad.rating || 0,
                    chemistry: finalData.squad.chemistry || 0,
                    playersAdded: added,
                    uiUpdated: uiUpdated
                });
            } catch (e) {
                sendResult({ success: false, error: e.message || 'Unknown error' });
            }
        }

        // --- Init EA side ---

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() { tryInjectSID(); });
        } else {
            setTimeout(tryInjectSID, 2000);
        }
        setTimeout(detectChallengeFromApp, 5000);
        console.log('[SBC Bridge] EA-side initialized');

    // =========================================================================
    // OPTIMIZER SIDE — runs on localhost / deployed app
    // =========================================================================
    } else {

        function parseSID(raw) { return raw ? raw.split('|')[0] : ''; }

        function dispatchEvent(name, detail) {
            unsafeWindow.dispatchEvent(new CustomEvent(name, { detail: detail }));
        }

        function dispatchFromGM(gmKey, eventName) {
            var val = GM_getValue(gmKey, '');
            if (val) {
                try { dispatchEvent(eventName, JSON.parse(val)); } catch (e) {}
            }
        }

        // SID sync
        function dispatchSID(sid) {
            if (sid) dispatchEvent('SBC_SID_UPDATE', { sid: sid });
        }

        unsafeWindow.addEventListener('SBC_REQUEST_SID', function() {
            dispatchSID(parseSID(GM_getValue('sbc_ea_sid', '')));
        });

        unsafeWindow.addEventListener('SBC_REFRESH_SID', function() {
            GM_setValue('sbc_request_sid_refresh', Date.now().toString());
        });

        GM_addValueChangeListener('sbc_ea_sid', function(name, oldVal, newVal) {
            dispatchSID(parseSID(newVal));
        });

        // Challenge sync
        dispatchFromGM('sbc_current_challenge', 'SBC_CHALLENGE_UPDATE');
        dispatchFromGM('sbc_squad_players', 'SBC_SQUAD_PLAYERS_UPDATE');

        unsafeWindow.addEventListener('SBC_REQUEST_CHALLENGE', function() {
            GM_setValue('sbc_request_challenge_refresh', Date.now().toString());
            dispatchFromGM('sbc_current_challenge', 'SBC_CHALLENGE_UPDATE');
        });

        GM_addValueChangeListener('sbc_squad_players', function(name, oldVal, newVal) {
            if (newVal) { try { dispatchEvent('SBC_SQUAD_PLAYERS_UPDATE', JSON.parse(newVal)); } catch (e) {} }
        });

        GM_addValueChangeListener('sbc_current_challenge', function(name, oldVal, newVal) {
            if (newVal) { try { dispatchEvent('SBC_CHALLENGE_UPDATE', JSON.parse(newVal)); } catch (e) {} }
        });

        // Inventory sync (tradepile, storage, duplicated — intercepted from EA)
        function dispatchInventory() {
            var val = GM_getValue('sbc_inventory', '');
            if (val) {
                try { dispatchEvent('SBC_INVENTORY_UPDATE', JSON.parse(val)); } catch (e) {}
            }
        }
        dispatchInventory();

        unsafeWindow.addEventListener('SBC_REQUEST_INVENTORY', function() {
            dispatchInventory();
        });

        GM_addValueChangeListener('sbc_inventory', function(name, oldVal, newVal) {
            if (newVal) { try { dispatchEvent('SBC_INVENTORY_UPDATE', JSON.parse(newVal)); } catch (e) {} }
        });

        // SBC sets sync (intercepted from EA's /sbs/sets)
        function dispatchSBCSets() {
            var val = GM_getValue('sbc_sets_data', '');
            if (val) {
                try { dispatchEvent('SBC_SETS_UPDATE', JSON.parse(val)); } catch (e) {}
            }
        }
        dispatchSBCSets();

        unsafeWindow.addEventListener('SBC_REQUEST_SETS', function() {
            dispatchSBCSets();
        });

        GM_addValueChangeListener('sbc_sets_data', function(name, oldVal, newVal) {
            if (newVal) { try { dispatchEvent('SBC_SETS_UPDATE', JSON.parse(newVal)); } catch (e) {} }
        });

        // Push command relay
        unsafeWindow.addEventListener('SBC_PUSH_COMMAND', function(e) {
            var payload = e.detail;
            payload.commandId = Date.now().toString();
            GM_setValue('sbc_push_command', JSON.stringify(payload));
        });

        GM_addValueChangeListener('sbc_push_result', function(name, oldVal, newVal, remote) {
            if (!remote) return;
            try { dispatchEvent('SBC_PUSH_RESULT', JSON.parse(newVal)); } catch (e) {}
        });

        // Signal ready
        unsafeWindow.__SBC_BRIDGE = true;
        dispatchEvent('SBC_BRIDGE_READY');
        console.log('[SBC Bridge] Optimizer-side initialized');
    }
})();
