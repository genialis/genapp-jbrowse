'use strict';
/**
 * ====
 * App
 * ====
 */

/**
 * .. js:class:: jbrowse
 *
 *      Base app declaration. Defines the imported modules and routing.
 *
 *      **URLS**:
 *
 *      * ``/`` - :js:func:`JBrowseController`
 *
 */
var jbrowse = angular.module('jbrowse', [
    'ngRoute', 'ngGrid', 'genjs.services', 'genjs.table', 'ui.bootstrap', 'jbrowse.controllers',
    'jbrowse.services', 'jbrowse.directives'
])
    .config(['$routeProvider', function ($routeProvider) {

       var resolveProject = ['resolveProject', function (resolveProject) {
           return resolveProject();
       }];

        $routeProvider.when('/', {
            templateUrl: '/static/genapp-jbrowse/partials/jbrowse.html',
            controller: 'JBrowseController',
            resolve: { _project: resolveProject },
            reloadOnSearch: false
        });
        $routeProvider.otherwise({
            redirectTo: '/'
        });
    }])

    .config(['$httpProvider', function ($httpProvider) {
        // Adds a csrftoken to all http requests.
        $httpProvider.defaults.headers.common['X-CSRFToken'] = $.cookie('csrftoken');
    }])
;
