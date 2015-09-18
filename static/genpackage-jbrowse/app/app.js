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
angular.module('jbrowse', [
    'ngRoute', 'ngGrid', 'genjs.services', 'genjs.table', 'ui.bootstrap', 'jbrowse.controllers',
    'jbrowse.services', 'jbrowse.directives'])

    .config(['$routeProvider', function ($routeProvider) {

       var resolveProjects = ['resolveProjects', function (resolveProjects) {
           return resolveProjects();
       }];

        $routeProvider.when('/', {
            templateUrl: '/static/genpackage-jbrowse/partials/jbrowse.html',
            controller: 'JBrowseController',
            resolve: { _projects: resolveProjects },
            reloadOnSearch: false
        }).otherwise({
            redirectTo: '/'
        });
    }])

    .config(['StateUrlProvider', function (StateUrlProvider) {
        StateUrlProvider.localstoragePath = 'jbrowseState';
    }])
;
