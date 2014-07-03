'use strict';

// CONSTANTS
var API_DATA_URL = '/api/v1/data/';

// DIRECTIVES
angular.module('jbrowse.directives', ['genjs.services'])
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
         *          <gen-browser name="browser" gen-browser-options="options">
         *
         *      Options varaibles:
         *      :gen-browser-options: list of default ng-grid options with few customizations
         *
         *      Extra fields:
         *      :config:        JBrowse config object.
         *      :onConnect:     On JBrowse initialize callback.
         *      :afterAdd:      Dict with data types as keys and callback functions as values. Callback is executed after
         *                      given data type is added to the browser.
         *
         *      Name variable:
         *      :name: name used for injecting controller into parent scope (with public API exposed)
         */

        return {
            restrict: 'E',
            scope: {
                genBrowserOptions: '='
            },
            replace: true,
            templateUrl: '/static/genapp-jbrowse/partials/directives/genbrowser.html',
            controller: ['$scope', 'notify', function ($scope, notify) {
                /**
                 * .. js::attribute:: JBrowse directive controller
                 *
                 *      Public API:
                 *
                 *      :js:func:`addTrack`
                 *          :param Object item: Genesis data item.
                 *
                 *      :js:func:`removeTracks`
                 *          :param Array labels: Tracks labels or track objects to delete.
                 */

                var self = this,
                    typeHandlers,
                    addTrack,
                    reloadRefSeqs,
                    preConnect,
                    connector,
                    getTrackByLabel;

                this._defaults = {
                    containerID: 'gen-browser'
                };

                // Handlers for each data object type.
                typeHandlers = {
                    'data:genome:fasta:': function (item) {
                        var baseUrl = API_DATA_URL + item.id + '/download/seq',
                            lbl = item.static.name,
                            dontLoad = false;

                        if ($scope.browser.config.stores) {
                             $scope.browser.getStore('refseqs', function (store) {
                                var seqTrackName;
                                if (!store) return;
                                seqTrackName = store.config.label;
                                if (lbl == seqTrackName) {
                                    dontLoad = true;
                                    return;
                                }
                                // remove all tracks if we're changing sequence.
                                self.removeTracks($scope.browser.config.tracks);
                                delete $scope.browser.config.stores['refseqs'];
                                delete $scope.browser._storeCache && $scope.browser._storeCache['refseqs'];
                            });
                        }

                        if (dontLoad) return;

                        reloadRefSeqs(baseUrl + '/refSeqs.json').then(function () {
                            addTrack({
                                type:        'JBrowse/View/Track/Sequence',
                                storeClass:  'JBrowse/Store/Sequence/StaticChunked',
                                urlTemplate: 'seq/{refseq_dirpath}/{refseq}-',
                                baseUrl:     baseUrl,
                                category:    'Reference sequence',
                                label:       lbl,
                                chunkSize:   20000
                            });
                        });
                    },
                    'data:alignment:bam:': function (item) {
                        var url = API_DATA_URL + item.id + '/download/';
                        addTrack({
                            type: 'JBrowse/View/Track/Alignments2',
                            storeClass: 'JBrowse/Store/SeqFeature/BAM',
                            category: 'NGS',
                            urlTemplate: url + item.output.bam.file,
                            baiUrlTemplate: url + item.output.bai.file,
                            label: item.static.name,
                            chunkSize: 20000
                        });
                    }
                };

                // Gets JBrowse track. Searches by label.
                getTrackByLabel = function (lbl) {
                    return _.findWhere($scope.browser.config.tracks || [], {label: lbl});
                };

                // Reloads reference sequences.
                reloadRefSeqs = function (newRefseqsUrl) {
                    var deferredRefSeqs,
                        deferredSetup,
                        setupFn;

                    delete $scope.browser._deferred['reloadRefSeqs'];
                    deferredSetup = $scope.browser._getDeferred('reloadRefSeqs');
                    setupFn = function () {
                        if (!('allRefs' in $scope.browser) || _.keys($scope.browser.allRefs).length == 0) {
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
                addTrack = function (trackCfg) {
                    var isSequenceTrack = trackCfg.type == 'JBrowse/View/Track/Sequence',
                        alreadyExists = getTrackByLabel(trackCfg.label) !== undefined;

                    if (alreadyExists) {
                        notify({message: "Track " + trackCfg.label + " is already present in the viewport.", type: "danger"});
                        return;
                    }

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
                    $scope.browser.loadConfig().then(function () {
                        // NOTE: must be in this order, since navigateToLocation will set reference sequence name,
                        // which will be used for loading sequence chunks.
                        if (isSequenceTrack) {
                            $scope.browser.navigateToLocation({ref: _.values($scope.browser.allRefs)[0].name});
                        }

                        $scope.browser.showTracks([trackCfg.label]);
                    });
                };

                // Publicly exposed API.
                this.addTrack = function (item) {
                    if (item.type in typeHandlers) {
                        typeHandlers[item.type](item);

                        if (item.type in ($scope.genBrowserOptions.afterAdd || {})) {
                            $scope.genBrowserOptions.afterAdd[item.type].call($scope.browser);
                        }
                    } else {
                        console.log('No handler for data type ' + item.type + ' defined.');
                    }
                };
                this.removeTracks = function (tracks) {
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
                    var $footer,
                        height;

                    $footer = $('footer').first();
                    height = $(window).height() - $footer.height();
                    $('#' + self._defaults['containerID']).height(height);
                };
                // Executes some misc. things when JBrowse intilializes.
                connector = function () {
                    // remove global menu bar
                    $scope.browser.afterMilestone('initView', function () {
                        dojo.destroy($scope.browser.menuBar);
                    });
                    // make sure tracks detached from the view ('hidden') actually are deleted in the browser instance
                    $scope.browser.subscribe('/jbrowse/v1/c/tracks/hide', function (trackCfgs) {
                        $scope.browser.publish('/jbrowse/v1/v/tracks/delete', trackCfgs);
                    });

                    if (_.isFunction($scope.genBrowserOptions.onConnect || {})) {
                        $scope.genBrowserOptions.onConnect.call($scope.browser);
                    }
                };

                // JBrowse initialization.
                require(['JBrowse/Browser', 'dojo/io-query', 'dojo/json'], function (Browser, ioQuery, JSON) {
                    var config = $scope.genBrowserOptions.config || { containerID: self._defaults['containerID'] };

                    // monkey-patch. We need to remove default includes, since off-the-shelf version of JBrowse
                    // forces loading of jbrowse.conf even if we pass empty array as includes.
                    Browser.prototype._configDefaults = function () {
                        return {
                            containerId: 'gen-browser',
                            dataRoot: API_DATA_URL,
                            baseUrl: API_DATA_URL,
                            browserRoot: '/static/jbrowse-1.11.4',
                            show_tracklist: false,
                            show_nav: true,
                            show_overview: true,
                            refSeqs: '/static/genapp-jbrowse/refSeqs_dummy.json',
                            nameUrl: '/static/genapp-jbrowse/names_dummy.json',
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

                    preConnect();
                    $scope.browser = new Browser(config);
                    connector();
                });
            }],
            link: function ($scope, $element, attrs, ctrl) {
                var alias = attrs.name;
                if (alias) {
                    $scope.$parent[alias] = ctrl;
                }
            }
        };
    }]);
