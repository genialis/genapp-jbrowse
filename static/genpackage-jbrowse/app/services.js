'use strict';
/**
 * ========
 * Services
 * ========
 */

angular.module('jbrowse.services', ['ngResource', 'genjs.services'])
    .value('version', '0.1')

    /**
     * Resolves the first project.
     */
    .factory('resolveProjects', ['$q', '$route', 'Project', function ($q, $route, Project, notify) {
        return function () {
            var deferred = $q.defer();
            Project.get({}, function (cases) {
                deferred.resolve(cases.objects);
            }, function (reason) {
                var message = "An error occured, sorry";
                if (reason.status == 404)
                    message = "No project found.";
                else if (reason.status == 401)
                    message = "You do not have permission to view this case";
                notify({message: "An error occured, sorry", type: 'danger'});
                deferred.reject(message);
            });
            return deferred.promise;
        };
    }])

    /**
     * Generates JBrowse container IDs.
     */
    .factory('genBrowserId', [function () {
        var browserCount = 0,
            genBrowserId = {};

        genBrowserId.generateId = function () {
            var genId = 'gen-browser' + '-' + browserCount;
            browserCount += 1;
            return genId;
        };

        return genBrowserId;
    }])

    .factory('upperTypes', [function () {
        /**
         *  Splits 'data:a:b:c:#x' into ['data:a:b:c:#x', 'data:a:b:#x', 'data:a:#x', 'data:#x'].
         *  Array also has a method getHighestIn(dict)
         */
        var upperTypes = function (type) {
            if (!(_.contains(type, ':#') || _.last(type) == ':')) throw new Error("type is missing the last ':' or ':#'");
            var typeWithoutLast = type.slice(0, type.lastIndexOf(':'));
            var postType = type.slice(type.lastIndexOf(':'));

            var splits = typeWithoutLast.split(':');
            var ret = _.map(splits, function (s, ix) {
                return _.initial(splits, ix).join(':') + postType;
            });
            ret.getHighestIn = function (dict) {
                return _.find(ret, function (upType) {
                    return upType in dict;
                });
            };
            return ret;
        };
        upperTypes.test = function () {
            if (!_.isEqual(upperTypes('data:a:b:c:#x'), ['data:a:b:c:#x', 'data:a:b:#x', 'data:a:#x', 'data:#x'])) throw new Error('upperTypes test failed');
            if (!_.isEqual(upperTypes('data:a:b:c:'), ['data:a:b:c:', 'data:a:b:', 'data:a:', 'data:'])) throw new Error('upperTypes test failed');
            var dict = {
                'data:a:c:': 2,
                'data:a:#x': 4
            };
            if (upperTypes('data:a:b:c:#x').getHighestIn(dict) != 'data:a:#x') throw new Error('upperTypes.getHighestIn test failed');
            if (upperTypes('data:e:b:c:').getHighestIn(dict)) throw new Error('upperTypes.getHighestIn test failed');
        };
        return upperTypes;
    }])
    /**
     * Data types supported by Genesis JBrowse implementation.
     *
     *  - List represents conjunction
     *  - Dict represents disjunction
     *
     *  Examples:
     *
     *  Conjunction over multiple object fields:
     *      The following piece of code requires field output.bam.file to contain a file with .bam extension
     *      and output.bai.file to contain a file with .bai extension in order to declare given data item as supported.
     *
     *      'data:alignment:bam:': [
     *          {'output.bam.file': /\.bam$/i},
     *          {'output.bai.file': /\.bai$/i}
     *      ]
     *
     *  Conjunction over multiple values of a single field:
     *      Similarly, for the 'refs' fields (always a list, required by processor schema), we can require the field to
     *      contain two files (both must be present at the same time):
     *
     *      'data:variants:vcf:': {
     *          'output.vcf.refs': [/\.vcf\.bgz$/i, /\.vcf\.bgz\.tbi$/i]
     *      }
     *
     *  Disjunction over multiple fields:
     *      If we want to check whether at least one field suffices our condition, we can simply make a disjunction:

     *      'data:expression:polya:': {
     *          'output.exp.refs': /\.bw/,
     *          'output.rpkmpolya.refs': /\.bw/,
     *          ............
     *      }
     *
     *  Combining:
     *      Lets combine disjunction and conjunction. We require at least one of rpkm* fields to contain
     *      both ".tab" file and ".bw" file.
     *
     *      'data:expression:polya:': {
     *          'output.exp.refs': [/\.tab/, /\.bw/],
     *          'output.rpkmpolya.refs': [/\.tab/, /\.bw/],
     *          ............
     *      }
     */
    .factory('supportedTypes', ['upperTypes', function (upperTypes) {
        var commonPatterns,
            canShowPatterns,
            organization,
            api = {};

        // Organization of data selector tabs.
        organization = {
            'Sequence': {
                'data:genome:fasta:': true
            },
            'Other': {
                'data:alignment:bam:': true,
                'data:expression:polya:': true,
                'data:variants:vcf:': true,
                'data:annotation:gff3:': true,
                'data:mappability:bcm:': true,
                'data:bigwig:mappability:': true,
                'data:annotation:gtf:': true
            }
        };

        commonPatterns = {
            bigWig: /\.bw$/i,
            exprBigWig: /\.tab\.bw$/i,
            vcf: /\.vcf\.bgz$/i,
            vcfIdx: /\.vcf\.bgz\.tbi$/i,
            gff: /^tracks\/gff-track$/
        };

        canShowPatterns = {
            'data:genome:fasta:': {
                'output.fasta.refs': [/^seq$/, /^seq\/refSeqs\.json$/]
            },
            'data:alignment:bam:': [
                {
                    'output.bam.file': /\.bam$/i
                },
                {
                    'output.bai.file': /\.bai$/i
                }
            ],
            'data:expression:polya:': {
                'output.rc_raw.refs': commonPatterns['exprBigWig'],
                'output.rc.refs': commonPatterns['exprBigWig'],
                'output.rpkm.refs': commonPatterns['exprBigWig'],
                'output.rpkmpolya.refs': commonPatterns['exprBigWig'],
                'output.rpkum.refs': commonPatterns['exprBigWig'],
                'output.exp.refs': commonPatterns['exprBigWig']
            },
            'data:variants:vcf:': {
                'output.vcf.refs': [commonPatterns['vcf'], commonPatterns['vcfIdx']]
            },
            'data:annotation:gff3:': {
                'output.gff.refs': commonPatterns['gff']
            },
            'data:annotation:gtf:': {
                'output.gtf.refs': commonPatterns['gff']
            },
            'data:mappability:bcm:': {
                'output.mappability.refs': commonPatterns['exprBigWig']
            },
            'data:bigwig:mappability:': {
                'output.bigwig.file': commonPatterns['bigWig']
            }
        };

        // Tells whether given item can be shown in data selector (in given selection mode, e.g. 'Sequence' or 'Other')
        api.canShow = function(item, selectionMode) {
            var compute;

            compute = function (conditions, fieldName) {
                var entries;
                if (_.isRegExp(conditions)) {
                    entries = _.path(item, fieldName);
                    if (!_.isArray(entries)) entries = [entries];
                    return _.some(entries, _.bind(conditions.test, conditions));
                } else if (_.isArray(conditions)) {
                    return _.every(conditions, function (arrItem) {
                        return compute(arrItem, fieldName);
                    });
                } else if (_.isObject(conditions)) {
                    return _.some(conditions, compute);
                }
            };

            if (item.status !== 'done') return false;
            var upTypes = upperTypes(item.type);
            var showableUpperType = upTypes.getHighestIn(canShowPatterns);
            if (!showableUpperType) return false;

            var orgUpperType = upTypes.getHighestIn(organization[selectionMode]);
            if (selectionMode && !orgUpperType) return false;

            return compute(canShowPatterns[showableUpperType]);
        };

        api.find = function (item, propPath, pattern) {
            var entries = _.path(item, propPath);
            if (!_.isArray(entries)) entries = [entries];
            return _.find(entries, _.bind(pattern.test, pattern)) || false;
        };

        api.patterns = commonPatterns;

        return api;
    }])
;
