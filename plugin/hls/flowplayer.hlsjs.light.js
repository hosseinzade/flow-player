/*jslint browser: true, for: true, node: true */
/*eslint indent: ["error", 4], no-empty: ["error", { "allowEmptyCatch": true }] */
/*eslint-disable quotes, no-console */
/*global window */

/*!

   hlsjs engine plugin (light) for Flowplayer HTML5

   Copyright (c) 2015-2017, Flowplayer Drive Oy

   Released under the MIT License:
   http://www.opensource.org/licenses/mit-license.php

   Includes hls.light.js
   Copyright (c) 2017 Dailymotion (http://www.dailymotion.com)
   https://github.com/video-dev/hls.js/blob/master/LICENSE

   Requires Flowplayer HTML5 version 7 or greater
   $GIT_DESC$

*/
(function () {
    "use strict";
    var extension = function (Hls, flowplayer) {
        var engineName = "hlsjs",
            hlsconf,
            common = flowplayer.common,
            extend = flowplayer.extend,
            support = flowplayer.support,
            brwsr = support.browser,
            desktopSafari = brwsr.safari && support.dataload,
            androidChrome = (support.android && !support.android.firefox) ||
                    (!support.firstframe && support.dataload && !brwsr.mozilla),
            win = window,
            mse = win.MediaSource || win.WebKitMediaSource,
            performance = win.performance,

            isHlsType = function (typ) {
                return typ.toLowerCase().indexOf("mpegurl") > -1;
            },
            hlsQualitiesSupport = function (conf) {
                var hlsQualities = (conf.clip && conf.clip.hlsQualities) || conf.hlsQualities;

                return support.inlineVideo &&
                        (hlsQualities === true ||
                        (hlsQualities && hlsQualities.length));
            },

            engineImpl = function hlsjsEngine(player, root) {
                var bean = flowplayer.bean,
                    videoTag,
                    hls,

                    recover, // DEPRECATED
                    recoverMediaErrorDate,
                    swapAudioCodecDate,
                    recoveryClass = "is-seeking",
                    posterClass = "is-poster",
                    doRecover = function (conf, etype, isNetworkError) {
                        if (conf.debug) {
                            console.log("recovery." + engineName, "<-", etype);
                        }
                        common.removeClass(root, "is-paused");
                        common.addClass(root, recoveryClass);
                        if (isNetworkError) {
                            hls.startLoad();
                        } else {
                            var now = performance.now();
                            if (!recoverMediaErrorDate || now - recoverMediaErrorDate > 3000) {
                                recoverMediaErrorDate = performance.now();
                                hls.recoverMediaError();
                            } else if (!swapAudioCodecDate || (now - swapAudioCodecDate) > 3000) {
                                swapAudioCodecDate = performance.now();
                                hls.swapAudioCodec();
                                hls.recoverMediaError();
                            }
                        }
                        // DEPRECATED
                        if (recover > 0) {
                            recover -= 1;
                        }
                        bean.one(videoTag, "seeked." + engineName, function () {
                            if (videoTag.paused) {
                                common.removeClass(root, posterClass);
                                player.poster = false;
                                videoTag.play();
                            }
                            common.removeClass(root, recoveryClass);
                        });
                    },
                    handleError = function (errorCode, src, url) {
                        var errobj = {code: errorCode};

                        if (errorCode > 2) {
                            errobj.video = extend(player.video, {
                                src: src,
                                url: url || src
                            });
                        }
                        return errobj;
                    },

                    maxLevel = 0,
                    lastSelectedLevel = -1,
                    initQualitySelection = function (hlsQualitiesConf, data) {
                        var levels = data.levels,
                            hlsQualities,
                            getLevel = function (q) {
                                return isNaN(Number(q))
                                    ? q.level
                                    : q;
                            };

                        if (!hlsQualitiesConf || levels.length < 2) {
                            return;
                        }

                        if (hlsQualitiesConf === "drive") {
                            switch (levels.length) {
                            case 4:
                                hlsQualities = [1, 2, 3];
                                break;
                            case 5:
                                hlsQualities = [1, 2, 3, 4];
                                break;
                            case 6:
                                hlsQualities = [1, 3, 4, 5];
                                break;
                            case 7:
                                hlsQualities = [1, 3, 5, 6];
                                break;
                            case 8:
                                hlsQualities = [1, 3, 6, 7];
                                break;
                            default:
                                if (levels.length < 3 ||
                                        (levels[0].height && levels[2].height && levels[0].height === levels[2].height)) {
                                    return;
                                }
                                hlsQualities = [1, 2];
                            }
                            hlsQualities.unshift(-1);
                        } else {
                            switch (typeof hlsQualitiesConf) {
                            case "object":
                                hlsQualities = hlsQualitiesConf.map(getLevel);
                                break;
                            case "string":
                                hlsQualities = hlsQualitiesConf.split(/\s*,\s*/).map(Number);
                                break;
                            default:
                                hlsQualities = levels.map(function (_level, i) {
                                    return i;
                                });
                                hlsQualities.unshift(-1);
                            }
                        }

                        hlsQualities = hlsQualities.filter(function (q) {
                            if (q > -1 && q < levels.length) {
                                var level = levels[q];

                                // do not check audioCodec,
                                // as e.g. HE_AAC is decoded as LC_AAC by hls.js on Android
                                return !level.videoCodec ||
                                        (level.videoCodec &&
                                        mse.isTypeSupported('video/mp4;codecs=' + level.videoCodec));
                            } else {
                                return q === -1;
                            }
                        });

                        player.video.qualities = hlsQualities.map(function (idx, i) {
                            var level = levels[idx],
                                q = typeof hlsQualitiesConf === "object"
                                    ? hlsQualitiesConf.filter(function (q) {
                                        return getLevel(q) === idx;
                                    })[0]
                                    : idx,
                                label = "Level " + (i + 1);

                            if (idx < 0) {
                                label = q.label || "Auto";
                            } else if (q.label) {
                                label = q.label;
                            } else {
                                if (level.width && level.height) {
                                    label = Math.min(level.width, level.height) + "p";
                                }
                                if (hlsQualitiesConf !== "drive" && level.bitrate) {
                                    label += " (" + Math.round(level.bitrate / 1000) + "k)";
                                }
                            }
                            return {value: idx, label: label};
                        });

                        if (lastSelectedLevel > -1 || hlsQualities.indexOf(-1) < 0) {
                            hls.loadLevel = hlsQualities.indexOf(lastSelectedLevel) < 0
                                ? hlsQualities[0]
                                : lastSelectedLevel;
                            hls.config.startLevel = hls.loadLevel;
                            player.video.quality = hls.loadLevel;
                        } else {
                            player.video.quality = -1;
                        }
                        lastSelectedLevel = player.video.quality;
                    },

                    engine = {
                        engineName: engineName,

                        pick: function (sources) {
                            var source = sources.filter(function (s) {
                                return isHlsType(s.type);
                            })[0];

                            if (typeof source.src === "string") {
                                source.src = common.createAbsoluteUrl(source.src);
                            }
                            return source;
                        },

                        load: function (video) {
                            var conf = player.conf,
                                EVENTS = {
                                    ended: "finish",
                                    loadeddata: !desktopSafari
                                        ? "ready"
                                        : 0,
                                    canplaythrough: desktopSafari
                                        ? "ready"
                                        : 0,
                                    pause: "pause",
                                    play: "resume",
                                    progress: "buffer",
                                    ratechange: "speed",
                                    seeked: "seek",
                                    timeupdate: "progress",
                                    volumechange: "volume",
                                    error: "error"
                                },
                                HLSEVENTS = Hls.Events,
                                autoplay = !!video.autoplay || !!conf.autoplay,
                                hlsQualitiesConf = video.hlsQualities || conf.hlsQualities,
                                hlsUpdatedConf = extend(hlsconf, conf.hlsjs, video.hlsjs),
                                hlsClientConf = extend({}, hlsUpdatedConf);

                            // allow disabling level selection for single clips
                            if (video.hlsQualities === false) {
                                hlsQualitiesConf = false;
                            }

                            if (!hls) {
                                videoTag = common.findDirect("video", root)[0]
                                        || common.find(".fp-player > video", root)[0];

                                if (videoTag) {
                                    // destroy video tag
                                    // otherwise <video autoplay> continues to play
                                    common.find("source", videoTag).forEach(function (source) {
                                        source.removeAttribute("src");
                                    });
                                    videoTag.removeAttribute("src");
                                    videoTag.load();
                                    common.removeNode(videoTag);
                                }

                                videoTag = common.createElement("video", {
                                    "class": "fp-engine " + engineName + "-engine",
                                    "autoplay": autoplay
                                        ? "autoplay"
                                        : false,
                                    "volume": player.volumeLevel
                                });

                                Object.keys(EVENTS).forEach(function (key) {
                                    var flow = EVENTS[key],
                                        type = key + "." + engineName,
                                        arg;

                                    bean.on(videoTag, type, function (e) {
                                        if (conf.debug && flow.indexOf("progress") < 0) {
                                            console.log(type, "->", flow, e.originalEvent);
                                        }

                                        var ct = videoTag.currentTime,
                                            seekable = videoTag.seekable,
                                            updatedVideo = player.video,
                                            seekOffset = updatedVideo.seekOffset,
                                            liveSyncPosition = player.live && hls.liveSyncPosition,
                                            buffered = videoTag.buffered,
                                            i,
                                            buffends = [],
                                            src = updatedVideo.src,
                                            errorCode;

                                        switch (flow) {
                                        case "ready":
                                            arg = extend(updatedVideo, {
                                                duration: videoTag.duration,
                                                seekable: seekable.length && seekable.end(null),
                                                width: videoTag.videoWidth,
                                                height: videoTag.videoHeight,
                                                url: src
                                            });
                                            break;
                                        case "resume":
                                            if (!hlsUpdatedConf.bufferWhilePaused) {
                                                hls.startLoad(ct);
                                            }
                                            break;
                                        case "seek":
                                            if (!hlsUpdatedConf.bufferWhilePaused && videoTag.paused) {
                                                hls.stopLoad();
                                            }
                                            arg = ct;
                                            break;
                                        case "pause":
                                            if (!hlsUpdatedConf.bufferWhilePaused) {
                                                hls.stopLoad();
                                            }
                                            break;
                                        case "progress":
                                            if (liveSyncPosition) {
                                                updatedVideo.duration = liveSyncPosition;
                                                if (player.dvr) {
                                                    player.trigger('dvrwindow', [player, {
                                                        start: seekOffset,
                                                        end: liveSyncPosition
                                                    }]);
                                                    if (ct < seekOffset) {
                                                        videoTag.currentTime = seekOffset;
                                                    }
                                                }
                                            }
                                            arg = ct;
                                            break;
                                        case "speed":
                                            arg = videoTag.playbackRate;
                                            break;
                                        case "volume":
                                            arg = videoTag.volume;
                                            break;
                                        case "buffer":
                                            for (i = 0; i < buffered.length; i += 1) {
                                                buffends.push(buffered.end(i));
                                            }
                                            arg = buffends.filter(function (b) {
                                                return b >= ct;
                                            }).sort()[0];
                                            updatedVideo.buffer = arg;
                                            break;
                                        case "finish":
                                            if (hlsUpdatedConf.bufferWhilePaused && hls.autoLevelEnabled &&
                                                    (updatedVideo.loop || conf.playlist.length < 2 || conf.advance === false)) {
                                                hls.nextLoadLevel = maxLevel;
                                            }
                                            break;
                                        case "error":
                                            errorCode = videoTag.error && videoTag.error.code;

                                            if ((hlsUpdatedConf.recoverMediaError && (errorCode === 3 || !errorCode)) ||
                                                    (hlsUpdatedConf.recoverNetworkError && errorCode === 2) ||
                                                    (hlsUpdatedConf.recover && (errorCode === 2 || errorCode === 3))) {
                                                e.preventDefault();
                                                doRecover(conf, flow, errorCode === 2);
                                                return;
                                            }

                                            arg = handleError(errorCode, src);
                                            break;
                                        }

                                        player.trigger(flow, [player, arg]);
                                    });
                                });

                                player.on("error." + engineName, function () {
                                    if (hls) {
                                        player.engine.unload();
                                    }

                                }).on("beforeseek." + engineName, function (e, api, pos) {
                                    if (pos === undefined) {
                                        e.preventDefault();
                                    } else if (!hlsUpdatedConf.bufferWhilePaused && api.paused) {
                                        hls.startLoad(pos);
                                    }
                                });

                                player.on("quality." + engineName, function (_e, _api, q) {
                                    if (hlsUpdatedConf.smoothSwitching) {
                                        hls.nextLevel = q;
                                    } else {
                                        hls.currentLevel = q;
                                    }
                                    lastSelectedLevel = q;
                                });

                                common.prepend(common.find(".fp-player", root)[0], videoTag);

                            } else {
                                hls.destroy();
                                if ((player.video.src && video.src !== player.video.src) || video.index) {
                                    common.attr(videoTag, "autoplay", "autoplay");
                                }
                            }

                            // #28 obtain api.video props before ready
                            player.video = video;

                            // reset
                            maxLevel = 0;

                            Object.keys(hlsUpdatedConf).forEach(function (key) {
                                if (!Hls.DefaultConfig.hasOwnProperty(key)) {
                                    delete hlsClientConf[key];
                                }

                                var value = hlsUpdatedConf[key];

                                switch (key) {
                                case "adaptOnStartOnly":
                                    if (value) {
                                        hlsClientConf.startLevel = -1;
                                    }
                                    break;
                                case "autoLevelCapping":
                                    if (value === false) {
                                        value = -1;
                                    }
                                    hlsClientConf[key] = value;
                                    break;
                                case "startLevel":
                                    switch (value) {
                                    case "auto":
                                        value = -1;
                                        break;
                                    case "firstLevel":
                                        value = undefined;
                                        break;
                                    }
                                    hlsClientConf[key] = value;
                                    break;
                                case "recover": // DEPRECATED
                                    hlsUpdatedConf.recoverMediaError = false;
                                    hlsUpdatedConf.recoverNetworkError = false;
                                    recover = value;
                                    break;
                                case "strict":
                                    if (value) {
                                        hlsUpdatedConf.recoverMediaError = false;
                                        hlsUpdatedConf.recoverNetworkError = false;
                                        recover = 0;
                                    }
                                    break;

                                }
                            });

                            hls = new Hls(hlsClientConf);
                            player.engine[engineName] = hls;
                            recoverMediaErrorDate = null;
                            swapAudioCodecDate = null;

                            Object.keys(HLSEVENTS).forEach(function (key) {
                                var etype = HLSEVENTS[key],
                                    listeners = hlsUpdatedConf.listeners,
                                    expose = listeners && listeners.indexOf(etype) > -1;

                                hls.on(etype, function (e, data) {
                                    var fperr,
                                        errobj = {},
                                        errors = player.conf.errors,
                                        ERRORTYPES = Hls.ErrorTypes,
                                        ERRORDETAILS = Hls.ErrorDetails,
                                        updatedVideo = player.video,
                                        src = updatedVideo.src;

                                    switch (key) {
                                    case "MANIFEST_PARSED":
                                        if (hlsQualitiesSupport(conf) && !player.pluginQualitySelectorEnabled) {
                                            initQualitySelection(hlsQualitiesConf, data);
                                        }
                                        break;
                                    case "MANIFEST_LOADED":
                                        if (data.audioTracks && data.audioTracks.length &&
                                                (!hls.audioTracks || !hls.audioTracks.length)) {
                                            errors.push("Alternate audio tracks not supported by light plugin build.");
                                            errobj = handleError(errors.length - 1, player.video.src);
                                            player.trigger('error', [player, errobj]);
                                            errors.slice(0, errors.length - 1);
                                        }
                                        break;
                                    case "MEDIA_ATTACHED":
                                        hls.loadSource(src);
                                        break;
                                    case "FRAG_LOADED":
                                        if (hlsUpdatedConf.bufferWhilePaused && !player.live &&
                                                hls.autoLevelEnabled && hls.nextLoadLevel > maxLevel) {
                                            maxLevel = hls.nextLoadLevel;
                                        }
                                        break;
                                    case "FRAG_PARSING_METADATA":
                                        data.samples.forEach(function (sample) {
                                            var metadataHandler;

                                            metadataHandler = function () {
                                                if (videoTag.currentTime < sample.dts) {
                                                    return;
                                                }
                                                bean.off(videoTag, 'timeupdate.' + engineName, metadataHandler);

                                                var raw = sample.unit || sample.data,
                                                    Decoder = win.TextDecoder;

                                                if (Decoder && typeof Decoder === "function") {
                                                    raw = new Decoder('utf-8').decode(raw);
                                                } else {
                                                    raw = decodeURIComponent(encodeURIComponent(
                                                        String.fromCharCode.apply(null, raw)
                                                    ));
                                                }
                                                player.trigger('metadata', [player, {
                                                    key: raw.substr(10, 4),
                                                    data: raw
                                                }]);
                                            };
                                            bean.on(videoTag, 'timeupdate.' + engineName, metadataHandler);
                                        });
                                        break;
                                    case "LEVEL_UPDATED":
                                        if (player.live) {
                                            player.video.seekOffset = data.details.fragments[0].start + hls.config.nudgeOffset;
                                        }
                                        break;
                                    case "BUFFER_APPENDED":
                                        common.removeClass(root, recoveryClass);
                                        break;
                                    case "ERROR":
                                        if (data.fatal || hlsUpdatedConf.strict) {
                                            switch (data.type) {
                                            case ERRORTYPES.NETWORK_ERROR:
                                                if (hlsUpdatedConf.recoverNetworkError || recover) {
                                                    doRecover(conf, data.type, true);
                                                } else if (data.frag && data.frag.url) {
                                                    errobj.url = data.frag.url;
                                                    fperr = 2;
                                                } else {
                                                    fperr = 4;
                                                }
                                                break;
                                            case ERRORTYPES.MEDIA_ERROR:
                                                if (hlsUpdatedConf.recoverMediaError || recover) {
                                                    doRecover(conf, data.type);
                                                } else {
                                                    fperr = 3;
                                                }
                                                break;
                                            default:
                                                fperr = 5;
                                            }

                                            if (fperr !== undefined) {
                                                errobj = handleError(fperr, src, data.url);
                                                player.trigger("error", [player, errobj]);
                                            }
                                        } else if (data.details === ERRORDETAILS.FRAG_LOOP_LOADING_ERROR ||
                                                data.details === ERRORDETAILS.BUFFER_STALLED_ERROR) {
                                            common.addClass(root, recoveryClass);
                                        }
                                        break;
                                    }

                                    // memory leak if all these are re-triggered by api #29
                                    if (expose) {
                                        player.trigger(e, [player, data]);
                                    }
                                });
                            });

                            if (hlsUpdatedConf.adaptOnStartOnly) {
                                bean.one(videoTag, "timeupdate." + engineName, function () {
                                    hls.loadLevel = hls.loadLevel;
                                });
                            }

                            hls.attachMedia(videoTag);

                            if (androidChrome && autoplay && videoTag.paused) {
                                var playPromise = videoTag.play();
                                if (playPromise !== undefined) {
                                    playPromise.catch(function () {
                                        player.unload();
                                        player.message("Please click the play button", 3000);
                                    });
                                }
                            }
                        },

                        resume: function () {
                            videoTag.play();
                        },

                        pause: function () {
                            videoTag.pause();
                        },

                        seek: function (time) {
                            videoTag.currentTime = time;
                        },

                        volume: function (level) {
                            if (videoTag) {
                                videoTag.volume = level;
                            }
                        },

                        speed: function (val) {
                            videoTag.playbackRate = val;
                            player.trigger('speed', [player, val]);
                        },

                        unload: function () {
                            if (hls) {
                                var listeners = "." + engineName;

                                hls.destroy();
                                hls = 0;
                                player.off(listeners);
                                bean.off(root, listeners);
                                bean.off(videoTag, listeners);
                                common.removeNode(videoTag);
                                videoTag = 0;
                            }
                        }
                    };

                return engine;
            };

        if (Hls.isSupported() && parseInt(flowplayer.version.split(".")[0]) > 6) {
            // only load engine if it can be used
            engineImpl.engineName = engineName; // must be exposed
            engineImpl.canPlay = function (type, conf) {
                if (conf[engineName] === false || conf.clip[engineName] === false) {
                    // engine disabled for player
                    return false;
                }

                // merge hlsjs clip config at earliest opportunity
                hlsconf = extend({
                    bufferWhilePaused: true,
                    smoothSwitching: true,
                    recoverMediaError: true
                }, conf[engineName], conf.clip[engineName]);

                // https://github.com/dailymotion/hls.js/issues/9
                return isHlsType(type) && (!desktopSafari || hlsconf.safari);
            };

            // put on top of engine stack
            // so hlsjs is tested before html5 video hls and flash hls
            flowplayer.engines.unshift(engineImpl);
        }

    };
    if (typeof module === 'object' && module.exports) {
        module.exports = extension.bind(undefined, require('hls.js'));
    } else if (window.Hls && window.flowplayer) {
        extension(window.Hls, window.flowplayer);
    }
}());
