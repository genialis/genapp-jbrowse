'use strict';
/**
 * ===========
 * Controllers
 * ===========
 */

angular.module('jbrowse.controllers', ['genjs.services', 'jbrowse.services'])

    /**
     * .. js:function:: JBrowseController(_projects, $scope)
     *
     *      **URL**: ``/``
     *
     *      :param _projects: a deferred promise resolved before initialization for the initial case
     *      :param $scope: Angular's scope service
     *
     *     Controlls JBrowse genome browser.
     */
    .controller('JBrowseController', ['_projects', '$scope', '$location', 'supportedTypes', 'captureScroll', 'genJbrowseTracksConfig', function (_projects, $scope, $location, supportedTypes, captureScroll, genJbrowseTracksConfig) {
        $scope.projects = _projects;

        // Project onclick handler.
        $scope.selectProject = function (project) {
            $scope.tableOptions.project = project;
            selectTypeFilter();
        };

        // Data table pre-filters
        var filters = {
            'Sequence': function (obj) {
                return supportedTypes.canShow(obj, 'Sequence');
            },
            'Other': function (obj) {
                return supportedTypes.canShow(obj, 'Other');
            }
        };
        $scope.selectionModel = {
            type: 'Sequence',
            restrictedMode: true
        };
        function selectTypeFilter() {
            var selectionType = $scope.selectionModel.type;
            if (!filters[selectionType]) return;
            $scope.tableOptions.filter = {
                selectionType: selectionType,
                _fn: filters[selectionType]
            };
        }
        $scope.$watch('selectionModel.type', selectTypeFilter);

        // Data selector collapsing
        $scope.isCollapsed = false;
        $scope.collapse = function (filterType) {
            $scope.isCollapsed = $scope.selectionModel.type === filterType;
            $scope.selectionModel.type = $scope.isCollapsed ? '' : filterType;
        };

        // Data table - intialized with the first case available
        // (the case is resolved by router before the controller is ran)
        $scope.selection = [];
        $scope.tableOptions = {
            itemsByPage: 15,
            project: _projects[0],
            genId: 'datalist-all',
            genPackage: 'jbrowse',
            multiSelect: false,
            showExport: false,
            showImport: false,
            selectedItems: $scope.selection,
            filter: {
                selectionType: 'Sequence',
                _fn: filters['Sequence']
            }
        };

        var config = _.merge(genJbrowseTracksConfig(), {});

        $scope.jbrowseOptions = {
            onConnect: function () {
                // when JBrowse is initialized, add the ability to select data in the table
                $scope.$watchCollection('selection', function (items) {
                    if (_.isEmpty(items)) return;
                    $scope.jbrowseOptions.addTrack(items[0], config);
                });
            },
            afterAdd: {
                // turn off restricted mode after a FASTA sequence is added
                'data:genome:fasta:': function () {
                    $scope.selectionModel.restrictedMode = false;
                    $scope.selectionModel.type = 'Other';
                }
            },
            keepState: true
        };
        $scope.jbrowseOptions = _.merge($scope.jbrowseOptions, {
            afterAdd: {
                'data:jbrowse:refseq:genome:': $scope.jbrowseOptions.afterAdd['data:genome:fasta:']
            }
        });


        $scope.clearState = function () {
            if (!confirm('Are you sure you want to reset jBrowse application?')) return;
            delete localStorage.jbrowseState;
            $location.search({});
            setTimeout(function () { location.reload(); }, 0);
        };

        captureScroll.liveCapture([
            '.dijitDialog .dijitDialogPaneContent' //works perfectly until scrolled without mouse over dialog
        ]);
    }])
;
