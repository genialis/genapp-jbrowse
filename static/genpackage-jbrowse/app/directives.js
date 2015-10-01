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
         *      :sortByGenialisIndex:  boolean indicating whether to sort tracks by genialisIndex.
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
            controller: ['$scope', '$q', '$timeout', '$filter', '$injector', 'TestFile', 'notify', 'genBrowserId', 'supportedTypes', 'upperTypes', function ($scope, $q, $timeout, $filter, $injector, TestFile, notify, genBrowserId, supportedTypes, upperTypes) {
                var escUrl,
                    defaultConfig,
                    typeHandlers,
                    purgeRefSeqs,
                    reloadRefSeqs,
                    preConnect,
                    connector,
                    loadStateConfigs;

                escUrl = $filter('escape');
                defaultConfig = {
                    containerID: genBrowserId.generateId()
                };
                $scope.config = $.extend(true, {}, defaultConfig, $scope.options.config);

                function fileUrl(id, filename, dontEscape) {
                    return '/data/' + id + '/' + (dontEscape ? filename : escUrl(filename));
                }

                // Before add handler for each data type.
                var beforeAdd = {
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
                beforeAdd = _.merge(beforeAdd, {
                    'data:jbrowse:refseq:genome:': beforeAdd['data:genome:fasta:']
                });

                // Handlers for each data object type.
                typeHandlers = {
                    'data:genome:fasta:': function (item, config) {
                        var bwFile = supportedTypes.find(item, 'output.twobit.refs', supportedTypes.patterns['bigWig']),
                            promise;

                        promise = addTrackInner({
                            genialisId: item.id,
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
                               return addTrackInner({
                                    genialisId: item.id + '#gc',
                                    genialisType: item.type + '#gc',
                                    type: 'JBrowse/View/Track/Wiggle/XYPlot',
                                    storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                                    label: item.static.name + ' GC Window',
                                    urlTemplate: fileUrl(item.id, bwFile)
                                }, config);
                            });
                        }

                        return promise;
                    },
                    'data:jbrowse:refseq:genome:': function (item, config) {
                        return typeHandlers['data:genome:fasta:'](item, config);
                    },
                    'data:alignment:bam:': function (item, config) {
                        return addTrackInner({
                            genialisId: item.id,
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
                            if (!bigWigFile) return false;

                            var bwItem = angular.copy(item);
                            bwItem.id = bwItem.id + ' Coverage';
                            bwItem.static.name = bwItem.static.name + ' Coverage';
                            bwItem.output.bigwig.file = bigWigFile;
                            return typeHandlers['data:reads:coverage:'](bwItem, config);
                        });
                    },
                    'data:reads:coverage:': function (item, config) {
                        return addTrackInner({
                            genialisId: item.id,
                            genialisType: item.type,
                            type: 'JBrowse/View/Track/Wiggle/XYPlot',
                            storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                            label: item.static.name,
                            urlTemplate: fileUrl(item.id, item.output.bigwig.file)
                        }, config);
                    },
                    'data:jbrowse:bigwig:': function (item, config) {
                        var coverageItem = angular.copy(item);
                        coverageItem.output.bigwig = coverageItem.output.bigwig_track;
                        return typeHandlers['data:reads:coverage:'](coverageItem, config);
                    },
                    'data:expression:polya:': function (item, config) {
                        var bigWigFile = supportedTypes.find(item, 'output.exp.refs', supportedTypes.patterns['bigWig']);

                        return bigWigFile && addTrackInner({
                            genialisId: item.id,
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

                        return addTrackInner({
                            genialisId: item.id,
                            genialisType: item.type,
                            type: 'JBrowse/View/Track/HTMLVariants',
                            storeClass: 'JBrowse/Store/SeqFeature/VCFTabix',
                            category: 'VCF',
                            urlTemplate: fileUrl(item.id, bgzipFile),
                            tbiUrlTemplate: fileUrl(item.id, tabixFile),
                            label: item.static.name
                        }, config);
                    },
                    'data:annotation:gff3:': function (item, config) {
                        var annotationFiles = false;
                        if (_.contains(item.output.gff.refs || [], 'tracks/gff-track')) annotationFiles = 'tracks/gff-track/{refseq}/trackData.json';
                        if (_.contains(item.output.gff.refs || [], 'tracks/annotation')) annotationFiles = 'tracks/annotation/{refseq}/trackData.json';
                        if (!annotationFiles) return;

                        return addTrackInner({
                            genialisId: item.id,
                            genialisType: item.type,
                            type: 'CanvasFeatures',
                            storeClass: 'JBrowse/Store/SeqFeature/NCList',
                            trackType: 'CanvasFeatures',
                            urlTemplate: fileUrl(item.id, annotationFiles, true),
                            label: item.static.name,
                            compress: 0,
                            style: {
                                className: 'feature'
                            }
                        }, config);
                    },
                    'data:annotation:gtf:': function (item, config) {
                        var gffItem = angular.copy(item);
                        gffItem.output.gff = gffItem.output.gtf;
                        return typeHandlers['data:annotation:gff3:'](gffItem, config);
                    },
                    'data:jbrowse:annotation:': function (item, config) {
                        var gffItem = angular.copy(item);
                        gffItem.output.gff = gffItem.output.annotation_track;
                        return typeHandlers['data:annotation:gff3:'](gffItem, config);
                    },
                    'data:mappability:bcm:': function (item, config) {
                        var bwFile = supportedTypes.find(item, 'output.mappability.refs', supportedTypes.patterns['exprBigWig']);

                        return bwFile && addTrackInner({
                            genialisId: item.id,
                            genialisType: item.type,
                            type: 'JBrowse/View/Track/Wiggle/XYPlot',
                            storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                            label: item.static.name + ' Coverage',
                            urlTemplate: fileUrl(item.id, bwFile),
                            autoscale: 'local'
                        }, config);
                    },
                    'data:bigwig:mappability:': function (item, config) {
                        return addTrackInner({
                            genialisId: item.id,
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
                    var StateUrl = $injector.get('StateUrl');
                    $scope.tracks = StateUrl($scope, ['tracks']).tracks || [];
                    _.each($scope.tracks, function (track) {
                        addTrackInner(track);
                    });
                };

                // Gets JBrowse track. Searches by label.
                function getTrackByLabel(lbl) {
                    return _.find($scope.browser.config.tracks, {label: lbl});
                }
                function getTrackById(lbl) {
                    return _.find($scope.browser.config.tracks, {genialisId: lbl});
                }

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

                function orderTracks() {
                    var view = $scope.browser.view;
                    view.tracks = _.sortBy(_.sortBy(view.tracks, 'name'), function (track) {
                        return track.config.genialisIndex;
                    });
                    _.each(view.tracks, function (track, ix) { track.index = ix; });
                    view.trackIndices = _.invertIndex(_.map(view.tracks, 'name'));
                    view.trackHeights = _.map(view.tracks, 'height');
                    view.redrawTracks();
                }

                var prevTrackPromise = $q.when();
                function addTrackInner(trackCfg, config) {
                    prevTrackPromise = prevTrackPromise.then(function () {
                        return addTrackInnerInner(trackCfg, config);
                    }).then(function () {
                        if ($scope.options.sortByGenialisIndex) {
                            var onVisibleChanged = $scope.browser.subscribe('/jbrowse/v1/n/tracks/visibleChanged', function () {
                                if (!_.find($scope.browser.view.tracks, {config: {label: trackCfg.label}})) return;
                                orderTracks();
                                onVisibleChanged.remove();
                            });
                        }
                    });
                    return prevTrackPromise;
                }
                function addTrackInnerInner(trackCfg, config) { // Adds track to JBrowse.
                    var isSequenceTrack = trackCfg.type == 'JBrowse/View/Track/Sequence';

                    if (!trackCfg.genialisType) throw new Error('Track is missing genialisType');
                    var cfgUpperType = config && upperTypes(trackCfg.genialisType).getHighestIn(config);
                    if (cfgUpperType) $.extend(trackCfg, config[cfgUpperType]);

                    if (trackCfg.dontAdd) return;

                    var alreadyExists = trackCfg.genialisId && getTrackById(trackCfg.genialisId);
                    if (alreadyExists) {
                        notify({message: "Track " + trackCfg.label + " is already present in the viewport.", type: "danger"});
                        return;
                    }

                    // must have unique label because jBrowse.showTracks uses labels as ids
                    if (getTrackByLabel(trackCfg.label)) {
                        var i = 1;
                        while (getTrackByLabel(trackCfg.label + ' ('+i+')') || i > 10000) i++;
                        trackCfg.label += ' ('+i+')';
                    }

                    var deferred = $q.defer();
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
                        if (!wasSuccessful) {
                            notify({message: 'Because there was an issue with track ' + trackCfg.label + ', it will not be shown', type: 'error'});
                            return;
                        }

                        function load() {
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
                                if (!_.find($scope.tracks, {label: trackCfg.label})) $scope.tracks.push(trackCfg);

                                if (trackCfg.genialisType in ($scope.options.afterAdd || {})) {
                                    $scope.options.afterAdd[trackCfg.genialisType].call($scope.browser);
                                }
                                return true;
                            });
                        }

                        if (trackCfg.genialisType in beforeAdd) {
                            return beforeAdd[trackCfg.genialisType](trackCfg).then(load);
                        } else {
                            return load();
                        }
                    });
                }

                // Publicly exposed API.
                /**
                 *  config can contain the following keys, or any upperTypes(key): {
                 *      'data:genome:fasta:': {},
                 *      'data:genome:fasta:#gc': {},
                 *      'data:alignment:bam:': {},
                 *      'data:expression:polya:': {},
                 *      'data:variants:vcf:': {},
                 *      'data:annotation:gff3:': {},
                 *      'data:annotation:gtf:': {},
                 *      'data:mappability:bcm:': {},
                 *      'data:bigwig:mappability:': {},
                 *      ...
                 *  }
                 *  Tracks are assigned genialisType = item's type + subtype.
                 *  Track configuration is extended with config[genialisType].
                 *
                 *  config[genialisType] can also contain dontAdd property, which will prevent track from being added.
                 */
                $scope.options.addTrack = function (item, config) {
                    var handlableUpperType = upperTypes(item.type).getHighestIn(typeHandlers);
                    if (!handlableUpperType) throw new Error('No handler for data type ' + item.type + ' defined.');
                    var maybePromise = typeHandlers[handlableUpperType](item, config);
                    return $q.when(maybePromise); // definitely promise
                };

                $scope.options.removeTracks = function (tracks) {
                    if (!tracks) return;
                    if (_.isString(tracks)) return this.removeTracks([tracks]);

                    var trackCfgs = [];
                    _.each(tracks, function (trackCfg) {
                        if (_.isString(trackCfg)) {
                            var t = getTrackById(trackCfg);
                            if (!_.isUndefined(t)) trackCfgs.push(t);
                        } else if (_.isObject(trackCfg)) {
                            trackCfgs.push(trackCfg);
                        }
                    });
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

                        var scrollbar = $($scope.browser.view.verticalScrollBar.container);
                        scrollbar.parent().parent().append(scrollbar);

                        dijit.Dialog.prototype.onShow = function () { // when dialog opens, scroll it to top
                            var dialog = this;
                            setTimeout(function () { //TODO: find a better way than a timeout
                                dialog.containerNode.scrollTop = 0;
                            }, 100);
                        };
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
