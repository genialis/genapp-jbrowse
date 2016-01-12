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
                var message = "An error occurred, sorry";
                if (reason.status == 404)
                    message = "No project found.";
                else if (reason.status == 401)
                    message = "You do not have permission to view this case";
                notify({message: "An error occurred, sorry", type: 'danger'});
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
        // Organization of data selector tabs.
        var organization = {
            'Sequence': {
                'data:genome:fasta:': true,
                'data:jbrowse:refseq:genome:': true
            },
            'Other': {
                'data:alignment:bam:': true,
                'data:expression:polya:': true,
                'data:variants:vcf:': true,
                'data:annotation:gff3:': true,
                'data:annotation:gtf:': true,
                'data:jbrowse:annotation:': true, // data:jbrowse:annotation:gtf: data:jbrowse:annotation:gff3:
                'data:reads:coverage:': true,
                'data:jbrowse:bigwig:': true, // data:jbrowse:bigwig:coverage:
                'data:mappability:bcm:': true,
                'data:bigwig:mappability:': true
            }
        };

        var commonPatterns = {
            bigWig: /\.bw$/i,
            exprBigWig: /\.tab\.bw$/i,
            vcf: /\.vcf\.bgz$/i,
            vcfIdx: /\.vcf\.bgz\.tbi$/i,
            gff: /^tracks\/(gff-track|annotation)$/i,
        };

        var canShowPatterns = {
            'data:genome:fasta:': {
                'output.fasta.refs': [/^seq$/, /^seq\/refSeqs\.json$/]
            },
            'data:jbrowse:refseq:genome:': {
                'output.refseq_track.refs': /^seq$/
            },
            'data:alignment:bam:': [
                { 'output.bam.file': /\.bam$/i },
                { 'output.bai.file': /\.bai$/i }
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
            'data:jbrowse:annotation:': { // data:jbrowse:annotation:gtf: data:jbrowse:annotation:gff3:
                'output.annotation_track.refs': commonPatterns['gff']
            },
            'data:reads:coverage:': {
                'output.bigwig.file': commonPatterns['bigWig']
            },
            'data:jbrowse:bigwig:': { // data:jbrowse:bigwig:coverage:
                'output.bigwig_track.file': commonPatterns['bigWig']
            },
            'data:mappability:bcm:': {
                'output.mappability.refs': commonPatterns['exprBigWig']
            },
            'data:bigwig:mappability:': {
                'output.bigwig.file': commonPatterns['bigWig']
            }
        };

        return {
            canShow: function (item, selectionMode) {
                // Tells whether given item can be shown in data selector (in given selection mode, e.g. 'Sequence' or 'Other')
                if (item.status !== 'done') return false;
                var upTypes = upperTypes(item.type);
                var showableUpperType = upTypes.getHighestIn(canShowPatterns);
                if (!showableUpperType) return false;

                var orgUpperType = upTypes.getHighestIn(organization[selectionMode]);
                if (selectionMode && !orgUpperType) return false;

                function calcCanShowRecursive(conditions, fieldName) {
                    if (_.isRegExp(conditions)) {
                        var entries = _.path(item, fieldName);
                        if (!_.isArray(entries)) entries = [entries];
                        return _.any(entries, _.bind(conditions.test, conditions));
                    }
                    if (_.isArray(conditions)) {
                        return _.all(conditions, function (arrItem) {
                            return calcCanShowRecursive(arrItem, fieldName);
                        });
                    }
                    if (_.isObject(conditions)) {
                        return _.any(conditions, function (objItem, objFieldName) {
                            return calcCanShowRecursive(objItem, objFieldName);
                        });
                    }
                }
                return calcCanShowRecursive(canShowPatterns[showableUpperType], null);
            },
            find: function (item, propPath, pattern) {
                var entries = _.path(item, propPath);
                if (!_.isArray(entries)) entries = [entries];
                return _.find(entries, _.bind(pattern.test, pattern)) || false;
            },
            patterns: commonPatterns
        };
    }])

    .factory('genJbrowseTracksConfig', [function () {
        var bootstrapPool = {
            primary: '#428bca',
            success: '#5cb85c',
            info: '#5bc0de',
            warning: '#f0ad4e',
            danger: '#d9534f'
        };

        return function () {
            var ret = {
                'data:genome:fasta:': {
                    label: 'Genome',
                },
                'data:genome:fasta:#gc': {
                    label: 'GC',
                    style: {
                        height: 60,
                        pos_color: bootstrapPool.primary
                    }
                },
                'data:variants:vcf:': {
                    label: 'Variants',
                    maxFeatureScreenDensity: 1,
                    maxHeight: 300,
                    style: {
                        featureCss: 'background-color: ' + bootstrapPool.warning
                    }
                },
                'data:reads:coverage:': {
                    label: 'Coverage',
                    autoscale: 'local',
                    min_score: 0,
                    type: 'Genialis/View/Track/Wiggle/XYPlot',
                    bicolor_pivot: 0,
                    style: {
                        pos_color: bootstrapPool.success,
                        neg_color: bootstrapPool.warning,
                        origin_color: bootstrapPool.warning
                    }
                },
                'data:annotation:gtf:': {
                    label: 'Features',
                    maxHeight: 1000,
                    histograms: {
                        storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                        color: bootstrapPool.warning
                    },
                    style: {
                        color: bootstrapPool.warning
                    }
                },
                'data:annotation:gff3:': {
                    histograms: {
                        storeClass: 'JBrowse/Store/SeqFeature/BigWig',
                        color: bootstrapPool.warning
                    },
                    style: {
                        color: bootstrapPool.warning
                    }
                },
                'data:bigwig:mappability:': {
                    label: 'Mappability',
                    style: {
                        pos_color: bootstrapPool.success
                    }
                }
            };
            return _.merge(ret, {
                'data:jbrowse:refseq:genome:': ret['data:genome:fasta:'],
                'data:jbrowse:bigwig:': ret['data:reads:coverage:'],
                'data:jbrowse:annotation:': ret['data:annotation:gff3:']
            });
        };
    }])
;
