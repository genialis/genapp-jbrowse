'use strict';

// DIRECTIVES
angular.module('jbrowse.directives', ['genjs.services', 'jbrowse.services'])
    .value('version', '0.1')

    .directive('genBrowser', ['notify', function (notify) {
        /**
         *  .. js::attribute:: genBrowser
         *
         *      :js:attr:`genBrowser` renders JBrowse genome browser
         *
         *      Usage example:
         *
         *      .. code-block:: html
         *
         *          <gen-browser options="options">
         *
         *      Options varaibles:
         *      :options:       dict of JBrowse options and callbacks
         *
         *      Fields:
         *      :config:        JBrowse config object.
         *      :size:          Height of JBrowse window. "auto" / amount in px.
         *      :onConnect:     On JBrowse initialize callback.
         *      :afterAdd:      Dict with data types as keys and callback functions as values. Callback is executed after
         *                      given data type is added to the browser.
         *      :keepState:     boolean indicating whether to load/save state from/to URL.
         *      :jbrowse:       Directive exposes JBrowse object after connecting
         *
         *      API:
         *      :js:func:`addTrack`
         *          :param Object item: Genesis data item.
         *      :js:func:`removeTracks`
         *          :param Array labels: Tracks labels or track objects to delete.
         */

        return {
            restrict: 'E',
            scope: {
                options: '='
            },
            replace: true,
            templateUrl: '/static/genpackage-jbrowse/partials/directives/genbrowser.html',
            controller: ['$scope', '$q', '$timeout', '$filter', '$injector', 'TestFile', 'notify', 'genBrowserId', 'supportedTypes', function ($scope, $q, $timeout, $filter, $injector, TestFile, notify, genBrowserId, supportedTypes) {
                var escUrl,
                    defaultConfig,
                    resolvedDefer,
                    resolvedPromise,
                    typeHandlers,
                    beforeAdd,
                    addTrack,
                    purgeRefSeqs,
                    reloadRefSeqs,
                    preConnect,
                    connector,
                    getTrackByLabel,
                    loadStateConfigs;

                escUrl = $filter('escape');
                defaultConfig = {
                    containerID: genBrowserId.generateId()
                };
                $scope.config = $.extend(true, {}, defaultConfig, $scope.options.config);
                resolvedDefer = $q.defer();
                resolvedDefer.resolve();
                resolvedPromise = resolvedDefer.promise;

                function fileUrl(id, filename, dontEscape) {
                    return '/data/' + id + '/' + (dontEscape ? filename : escUrl(filename));
                }

                // Before add handler for each data type.
                beforeAdd = {
                    'data:genome:fasta:': function (config) {
                        var purgeStorePromise = purgeRefSeqs(config.label),
                            reloadDeferred = $q.defer();

                        purgeStorePromise.then(function () {
                            reloadRefSeqs(config.baseUrl + '/refSeqs.json').then(function () {
                                reloadDeferred.resolve();
                            });
                        });
                        return reloadDeferred.promise;
                    }
                };

                // Handlers for each data object type.
                typeHandlers = {
                    'data:genome:fasta:': function (item, config) {
                        var bwFile = supportedTypes.find(item, 'output.twobit.refs', supportedTypes.patterns['bigWig']),
                            promise;

                        promise = addTrack({
                            genialisType: item.type,
                            type:        'JBrowse/View/Track/Sequence',
                            storeClass:  'JBrowse/Store/Sequence/StaticChunked',
                            urlTemplate: 'seq/{refseq_dirpath}/{refseq}-',
                            baseUrl:     fileUrl(item.id, 'seq'),
                            category:    'Reference sequence',
                            label:       item.static.name,
                            showTranslation: false
                        }, config);

                        if (bwFile) {
                            return promise.then(function () {
                               return addTrack({
                                    genialisType: item.type + 'gc:',
                                    type: 'JBrowse/View/Track/Wiggle/XYPlot',
                                    storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                                    label: item.static.name + ' GC Window',
                                    urlTemplate: fileUrl(item.id, bwFile)
                                }, config);
                            });
                        }

                        return promise;
                    },
                    'data:alignment:bam:': function (item, config) {
                        return addTrack({
                            genialisType: item.type,
                            type: 'JBrowse/View/Track/Alignments2',
                            storeClass: 'JBrowse/Store/SeqFeature/BAM',
                            category: 'NGS',
                            urlTemplate: fileUrl(item.id, item.output.bam.file),
                            baiUrlTemplate: fileUrl(item.id, item.output.bai.file),
                            label: item.static.name
                        }, config).then(function () {
                            // backwards compatibility
                            var bigWigFile = supportedTypes.find(item, 'output.bam.refs', supportedTypes.patterns['bigWig']);
                            return bigWigFile && $scope.options.addTrack({
                                id: item.id,
                                type: 'data:reads:coverage:',
                                static: { name: item.static.name + ' Coverage' },
                                output: { bigwig: { file: bigWigFile } }
                            }, config);
                        });
                    },
                    'data:reads:coverage:': function (item, config) {
                        return addTrack({
                            genialisType: item.type,
                            type: 'JBrowse/View/Track/Wiggle/XYPlot',
                            storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                            label: item.static.name,
                            urlTemplate: fileUrl(item.id, item.output.bigwig.file)
                        }, config);
                    },
                    'data:expression:polya:': function (item, config) {
                        var bigWigFile = supportedTypes.find(item, 'output.rpkumpolya.refs', supportedTypes.patterns['bigWig']);

                        return bigWigFile && addTrack({
                            genialisType: item.type,
                            type: 'JBrowse/View/Track/Wiggle/XYPlot',
                            storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                            label: item.static.name + ' RPKUM Coverage',
                            urlTemplate: fileUrl(item.id, bigWigFile),
                            autoscale: 'local'
                        }, config);
                    },
                    'data:variants:vcf:': function (item, config) {
                        var bgzipFile = supportedTypes.find(item, 'output.vcf.refs', supportedTypes.patterns['vcf']),
                            tabixFile = supportedTypes.find(item, 'output.vcf.refs', supportedTypes.patterns['vcfIdx']);

                        if (!(bgzipFile && tabixFile)) return;

                        return addTrack({
                            genialisType: item.type,
                            type: 'JBrowse/View/Track/HTMLVariants',
                            storeClass: 'JBrowse/Store/SeqFeature/VCFTabix',
                            category: 'VCF',
                            urlTemplate: fileUrl(item.id, bgzipFile),
                            tbiUrlTemplate: fileUrl(item.id, tabixFile),
                            label: item.static.name
                        }, config);
                    },
                    'data:annotation:gff3:': function(item, config) {
                        if (!_.contains(item.output.gff.refs || [], 'tracks/gff-track')) return;

                        return addTrack({
                            genialisType: item.type,
                            type: 'CanvasFeatures',
                            storeClass: 'JBrowse/Store/SeqFeature/NCList',
                            trackType: 'CanvasFeatures',
                            urlTemplate: fileUrl(item.id, 'tracks/gff-track/{refseq}/trackData.json', true),
                            label: item.static.name,
                            compress: 0,
                            style: {
                                className: 'feature'
                            }
                        }, config);
                    },
                    'data:annotation:gtf:': function(item, config) {
                        if (!_.contains(item.output.gtf.refs || [], 'tracks/gff-track')) return;

                        return addTrack({
                            genialisType: item.type,
                            type: 'CanvasFeatures',
                            storeClass: 'JBrowse/Store/SeqFeature/NCList',
                            trackType: 'CanvasFeatures',
                            urlTemplate: fileUrl(item.id, 'tracks/gff-track/{refseq}/trackData.json', true),
                            label: item.static.name,
                            compress: 0,
                            style: {
                                className: 'feature'
                            }
                        }, config);
                    },
                    'data:mappability:bcm:': function (item, config) {
                        var bwFile = supportedTypes.find(item, 'output.mappability.refs', supportedTypes.patterns['exprBigWig']);

                        return bwFile && addTrack({
                            genialisType: item.type,
                            type: 'JBrowse/View/Track/Wiggle/XYPlot',
                            storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                            label: item.static.name + ' Coverage',
                            urlTemplate: fileUrl(item.id, bwFile),
                            autoscale: 'local'
                        }, config);
                    },
                    'data:bigwig:mappability:': function (item, config) {
                        return addTrack({
                            genialisType: item.type,
                            type: 'JBrowse/View/Track/Wiggle/XYPlot',
                            storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                            label: item.static.name,
                            urlTemplate: fileUrl(item.id, item.output.bigwig.file),
                            autoscale: 'local'
                        }, config);
                    }
                };

                loadStateConfigs = function () {
                    var lastPromise,
                        StateUrl;

                    StateUrl = $injector.get('StateUrl');
                    $scope.tracks = StateUrl($scope, ['tracks']).tracks || [];
                    _.each($scope.tracks, function(cfg) {
                        var d = $q.defer();
                        if (typeof lastPromise === 'undefined') {
                            lastPromise = d.promise;
                            addTrack(cfg).then(function () {
                                d.resolve();
                            });
                        } else {
                            lastPromise.then(function () {
                                addTrack(cfg).then(function () {
                                    d.resolve();
                                });
                            });
                            lastPromise = d.promise;
                        }
                    });
                };

                // Gets JBrowse track. Searches by label.
                getTrackByLabel = function (lbl) {
                    return _.findWhere($scope.browser.config.tracks || [], {label: lbl});
                };

                // Purges reference sequence store.
                purgeRefSeqs = function (label) {
                    var purgeStoreDefer = $q.defer();
                    if ($scope.browser.config.stores) {
                        // Purge refseqs store before loading new one.
                         $scope.browser.getStore('refseqs', function (store) {
                            var seqTrackName;
                            if (!store) {
                                purgeStoreDefer.resolve();
                                return;
                            }
                            seqTrackName = store.config.label;
                            if (label == seqTrackName) {
                                purgeStoreDefer.reject();
                                return;
                            }
                            // remove all tracks if we're changing sequence.
                            $scope.options.removeTracks($scope.browser.config.tracks);
                            delete $scope.browser.config.stores['refseqs'];
                            if ($scope.browser._storeCache) delete $scope.browser._storeCache['refseqs'];
                            purgeStoreDefer.resolve();
                        });
                    } else {
                        purgeStoreDefer.resolve();
                    }
                    return purgeStoreDefer.promise;
                };

                // Reloads reference sequences.
                reloadRefSeqs = function (newRefseqsUrl) {
                    var deferredRefSeqs,
                        deferredSetup,
                        setupFn;

                    delete $scope.browser._deferred['reloadRefSeqs'];
                    deferredSetup = $scope.browser._getDeferred('reloadRefSeqs');
                    setupFn = function () {
                        if (!('allRefs' in $scope.browser) || _.keys($scope.browser.allRefs).length <= 0) {
                            return;
                        }
                        _.each($scope.browser.allRefs, function (r){
                            $scope.browser.refSeqSelectBox.addOption({
                                label: r.name,
                                value: r.name
                            });
                        });

                        deferredSetup.resolve(true);
                    };

                    $scope.browser.allRefs = {};
                    $scope.browser.refSeq = null;
                    $scope.browser.refSeqOrder = [];
                    $scope.browser.refSeqSelectBox.removeOption($scope.browser.refSeqSelectBox.getOptions());
                    $scope.browser.refSeqSelectBox.set('value', '');

                    $scope.browser.config['refSeqs'] = {
                        url: newRefseqsUrl
                    };

                    delete $scope.browser._deferred['loadRefSeqs'];

                    deferredRefSeqs = $scope.browser.loadRefSeqs();
                    deferredRefSeqs.then(setupFn);

                    return deferredSetup;
                };

                // Adds track to JBrowse.
                addTrack = function (trackCfg, config) {
                    var isSequenceTrack = trackCfg.type == 'JBrowse/View/Track/Sequence',
                        alreadyExists = getTrackByLabel(trackCfg.label) !== undefined,
                        deferred;

                    if (!trackCfg.genialisType) throw new Error('Track is missing genialisType');
                    if (config && config[trackCfg.genialisType]) {
                        $.extend(trackCfg, config[trackCfg.genialisType]);
                    }

                    if (trackCfg.dontAdd) return resolvedPromise;
                    if (alreadyExists) {
                        notify({message: "Track " + trackCfg.label + " is already present in the viewport.", type: "danger"});
                        return resolvedPromise;
                    }

                    deferred = $q.defer();
                    if (trackCfg.urlTemplate && !_.contains(trackCfg.urlTemplate, '{')) { //skip if it contains {refseq} or {refseq_dirpath}
                        TestFile(trackCfg.urlTemplate, function () {
                            deferred.resolve(true);
                        }, function () {
                            deferred.resolve(false);
                        });
                    } else {
                        deferred.resolve(true);
                    }

                    return deferred.promise.then(function (wasSuccessful) {
                        var load;

                        if (!wasSuccessful) {
                            notify({message: 'Because there was an issue with track ' + trackCfg.label + ', it will not be shown', type: 'error'});
                            return;
                        }

                        load = function () {
                            // prepare for config loading.
                            $scope.browser.config.include = [];
                            if ($scope.browser.reachedMilestone('loadConfig')) {
                                delete $scope.browser._deferred['loadConfig'];
                            }

                            $scope.browser.config.include.push({
                                format: 'JB_json',
                                version: 1,
                                data: {
                                    sourceUrl: trackCfg.baseUrl || '#',
                                    tracks: [trackCfg]
                                }
                            });

                            return $scope.browser.loadConfig().then(function () {
                                // NOTE: must be in this order, since navigateToLocation will set reference sequence name,
                                // which will be used for loading sequence chunks.
                                if (isSequenceTrack) {
                                    $scope.browser.navigateToLocation({ref: _.values($scope.browser.allRefs)[0].name});
                                }

                                $scope.browser.showTracks([trackCfg.label]);
                                if (typeof _.findWhere($scope.tracks, {label: trackCfg.label}) == 'undefined') {
                                    $scope.tracks.push(trackCfg);
                                }

                                if (trackCfg.genialisType in ($scope.options.afterAdd || {})) {
                                    $scope.options.afterAdd[trackCfg.genialisType].call($scope.browser);
                                }
                                return true;
                            });
                        };

                        if (trackCfg.genialisType in beforeAdd) {
                            return beforeAdd[trackCfg.genialisType](trackCfg).then(load);
                        } else {
                            return load();
                        }
                    });
                };

                // Publicly exposed API.
                /**
                 *  config can contain the following keys: {
                 *      'data:genome:fasta:': {},
                 *      'data:genome:fasta:gc': {},
                 *      'data:alignment:bam:': {},
                 *      'data:alignment:bam:bigwig': {},
                 *      'data:expression:polya:': {},
                 *      'data:variants:vcf:': {},
                 *      'data:annotation:gff3:': {},
                 *      'data:annotation:gtf:': {},
                 *      'data:mappability:bcm:': {},
                 *      'data:bigwig:mappability:': {}
                 *  }
                 *  Tracks are assigned genialisType = item's type + subtype.
                 *  Track configuration is extended with config[genialisType].
                 *
                 *  config[genialisType] can also contain dontAdd property, which will prevent track from being added.
                 */
                $scope.options.addTrack = function (item, config) {
                    var maybePromise;

                    if (!(item.type in typeHandlers)) throw new Error('No handler for data type ' + item.type + ' defined.');
                    maybePromise = typeHandlers[item.type](item, config);
                    // definitely promise
                    return resolvedPromise.then(function () {
                        return maybePromise;
                    });
                };

                $scope.options.removeTracks = function (tracks) {
                    var trackCfgs = [],
                        t;
                    if (_.isString(tracks)) {
                        this.removeTracks([tracks]);
                        return;
                    } else if (_.isArray(tracks)) {
                        _.each(tracks, function (trackCfg) {
                            if (_.isString(trackCfg)) {
                                t = getTrackByLabel(trackCfg);
                                if (typeof t !== 'undefined') trackCfgs.push(t);
                            } else if (_.isObject(trackCfg)) {
                                trackCfgs.push(trackCfg);
                            }
                        });
                    }
                    $scope.browser.publish('/jbrowse/v1/v/tracks/delete', trackCfgs);
                };

                // Execute some misc. things before we initialize JBrowse
                preConnect = function () {
                    var $el = $('#' + $scope.config['containerID']),
                        $footer = $('footer').first(),
                        height;

                    // Set fixed or automatic height
                    if (_.isNumber($scope.options.size)) {
                        height = $scope.options.size;
                    } else {
                        height = $(window).height() - $footer.height();
                    }
                    $el.height(height);
                };
                // Executes some misc. things when JBrowse intilializes.
                connector = function () {
                    // remove global menu bar
                    $scope.browser.afterMilestone('initView', function () {
                        dojo.destroy($scope.browser.menuBar);
                        $scope.tracks = [];
                        if ($scope.options.keepState) loadStateConfigs();
                    });
                    // make sure tracks detached from the view ('hidden') actually are deleted in the browser instance
                    $scope.browser.subscribe('/jbrowse/v1/c/tracks/hide', function (trackCfgs) {
                        var removedLabels = _.pluck(trackCfgs, 'label');
                        $scope.browser.publish('/jbrowse/v1/v/tracks/delete', trackCfgs);
                        $scope.tracks = _.filter($scope.tracks, function (track) {
                            return removedLabels.indexOf(track.label) == -1;
                        });
                        $scope.$digest();
                    });

                    if (_.isFunction($scope.options.onConnect || {})) {
                        $scope.options.onConnect.call($scope.browser);
                    }
                };

                // Delay initialization so that element with config['containerID'] actually exists
                $timeout(function () {
                    // JBrowse initialization.
                    require(['JBrowse/Browser', 'dojo/io-query', 'dojo/json'], function (Browser, ioQuery, JSON) {
                        var genialisPlugin = {
                            location: '/static/genpackage-jbrowse/jbrowse-plugins/genialis'
                        };

                        // monkey-patch. We need to remove default includes, since off-the-shelf version of JBrowse
                        // forces loading of jbrowse.conf even if we pass empty array as includes.
                        Browser.prototype._configDefaults = function () {
                            return {
                                containerId: 'gen-browser',
                                dataRoot: '/data/',
                                baseUrl: '/data/',
                                browserRoot: '/static/jbrowse-1.11.4',
                                show_tracklist: false,
                                show_nav: true,
                                show_overview: true,
                                refSeqs: '/static/genpackage-jbrowse/refSeqs_dummy.json',
                                nameUrl: '/static/genpackage-jbrowse/names_dummy.json',
                                highlightSearchedRegions: false,
                                makeFullViewURL: false,
                                updateBrowserURL: false,
                                highResolutionMode: 'enabled',
                                suppressUsageStatistics: true,
                                include: [],
                                tracks: [],
                                datasets: {
                                    _DEFAULT_EXAMPLES: false
                                }
                            };
                        };

                        if (!('plugins' in $scope.config)) {
                            $scope.config.plugins = {};
                        }
                        $scope.config.plugins['Genialis'] = genialisPlugin;

                        preConnect();
                        $scope.browser = new Browser($scope.config);
                        $scope.options.jbrowse = $scope.browser;
                        connector();
                    });
                });

                // Destroy everything, otherwise jBrowse doesnt want to initialize again (unless page reloaded)
                $scope.$on('$destroy', function () {
                    _.each(dijit.registry.toArray(), function (e) {
                        var r = e.id && dijit.registry.byId(e.id);
                        r && r.destroy();
                    });
                });
            }]
        };
    }]);
