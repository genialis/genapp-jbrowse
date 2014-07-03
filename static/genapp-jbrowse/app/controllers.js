'use strict';
/**
 * ===========
 * Controllers
 * ===========
 */

angular.module('jbrowse.controllers', ['genjs.services'])

    /**
     * .. js:function:: JBrowseController(Project, _project, $scope, $route)
     *
     *      **URL**: ``/``
     *
     *      :param Project: :class:`Case <server.models.Case>` resource
     *      :param _project: a deferred promise resolved before initialization for the initial case
     *      :param $scope: Angular's scope service
     *      :param $route: Angular's route service
     *
     *     Controlls JBrowse genome browser.
     */
    .controller('JBrowseController', ['Project', '_project', '$scope', '$route', function (Project, _project, $scope, $route) {
        var filters;


        // Fetch projects.
        Project.get({}, function (data) {
            $scope.projectsData = data;
        });

        // Project onclick handler.
        $scope.selectProject = function (caseId) {
            var project = _.find($scope.projectsData.objects || [], function (p) {
                return p.id == caseId;
            });

            if (typeof project !== 'undefined') {
                $route.current.params.caseId = project.id;
                $scope.project = project;
                $scope.tableOptions.project = project;
            }
        };

        // Data table pre-filters
        filters = {
            'Sequence': function (obj) {
                var showTypes = {"data:genome:fasta:": true};
                return obj.type in showTypes;
            },
            'Other': function (obj) {
                var showTypes = {"data:alignment:bam:": true};
                return obj.type in showTypes;
            }
        };
        $scope.selectionModel = {
            type: 'Sequence',
            restrictedMode: true
        };
        $scope.$watch('selectionModel.type', function (selectionType) {
            if (selectionType in filters) {
                $scope.tableOptions.filter = filters[selectionType];
            }
        });

        // Data selector collapsing
        $scope.isCollapsed = false;
        $scope.collapse = function (filterType) {
            if ($scope.selectionModel.type === filterType) {
                $scope.isCollapsed = true;
                $scope.selectionModel.type = '';
            } else {
                $scope.isCollapsed = false;
                $scope.selectionModel.type = filterType;
            }
        };

        // Data table - intialized with the first case available
        // (the case is resolved by router before the controller is ran)
        $scope.selection = [];
        $scope.project = _project;
        $scope.tableOptions = {
            itemsByPage: 15,
            project: $scope.project,
            genId: 'datalist-all',
            multiSelect: false,
            showExport: false,
            showImport: false,
            selectedItems: $scope.selection,
            filter: filters['Sequence']
        };

        // JBrowse options
        $scope.genBrowserOptions = {
            onConnect: function () {
                // when JBrowse is initialized, add the ability to select data in the table
                $scope.$watch('selection', function (items) {
                    if (!_.isArray(items) || items.length == 0) return;
                    $scope.browser.addTrack(items[0]);
                }, true);
            },
            afterAdd: {
                // turn off restricted mode after a FASTA sequence is added
                'data:genome:fasta:': function () {
                    $scope.selectionModel.restrictedMode = false;
                    $scope.selectionModel.type = 'Other';
                }
            }
        };
    }])

    /**
     * .. js:function:: DataPickerToggleCtl($scope)
     *
     *      :param $scope: Angular's scope service
     *
     *     Controlls toggling of data selector.
     */
    .controller('DataPickerToggleCtl', ['$scope', function ($scope) {
        $scope.isCollapsed = true;
    }])
;
