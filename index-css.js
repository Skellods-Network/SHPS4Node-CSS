'use strict';

var me = module.exports;

const defer = require('promise-defer');
var async = require('vasync');
var q = require('q');

var libs = require('node-mod-load').libs;


const getMediaQueries = function f_CSS_getMediaQueries($requestState) {

    var d = defer();

    libs.sql.newSQL('default', $requestState).done($sql => {

        const tbl = $sql.openTable('mediaQuery');
        $sql.query()
            .get(tbl.col('*'))
            .execute()
            .done($rows => {

                $sql.free();
                d.resolve($rows);
            }, $err => {

                $sql.free();
                d.reject($err);
            });
    }, d.reject);

    return d.promise;
};

var _CSS
= me.CSS = function c_CSS($requestState) {
    
    /**
     * Handle a CSS request
     * 
     * @result Promise()
     */
    var _handle =
    this.handle = function f_CSS_handle() {
        
        var defer = q.defer();
        var css = $requestState.GET['css'];
        if (!css) {
            
            defer.resolve();
            return defer.promise;
        }

        getMediaQueries($requestState).then($meduaQueries => {

            var i = 0;
            const l = $meduaQueries.length;
            const mediaQueries = {};
            while (i < l) {

                mediaQueries[$meduaQueries[i].ID] = $meduaQueries[i];
                mediaQueries[$meduaQueries[i].ID].css = '';
                i++;
            }

            libs.sql.newSQL('default', $requestState).done(function ($sql) {

                const tblCSS = $sql.openTable('css');
                const tblNS = $sql.openTable('namespace');
                const tblLayers = $sql.openTable('CSSLayer');
                $sql.query()
                    .get([
                        tblCSS.col('name'),
                        tblCSS.col('content'),
                        tblCSS.col('language'),
                        tblCSS.col('mediaQuery'),
                    ])
                    .fulfilling()
                    .eq(tblCSS.col('namespace'), tblNS.col('ID'))
                    .eq(tblNS.col('name'), $requestState.namespace)
                    .eq(tblCSS.col('layer'), tblLayers.col('ID'))
                    .orderBy(tblLayers.col('order'))
                    .execute()
                    .done(function ($rows) {

                        $sql.free();
                        var l = $rows.length;
                        if (l <= 0) {

                            libs.log.newLog($requestState).writeWarning('No Rows: ' + $sql.getLastQuery());
                            defer.reject(new Error(SHPS_ERROR_NO_ROWS));
                            return;
                        }

                        var i = 0;
                        var row;
                        var sb = libs.sandbox.newSandbox($requestState);
                        var r;
                        var cssFile = '';
                        sb.addFeature.allSHPS();
                        async.forEachParallel({

                            inputs: $rows,
                            func: function ($arg, $cb) {

                                libs.make.run($requestState, $arg.content, $arg.language, sb, false).done(function ($res) {

                                    if ($res.status) {

                                        if ($arg.mediaQuery == 0) {

                                            cssFile += $arg.name + '{' + $res.result + '}';
                                        }
                                        else {

                                            //TODO: Make MediaQueries layer-aware
                                            mediaQueries[$arg.mediaQuery].css += $arg.name + '{' + $res.result + '}';
                                        }
                                    }

                                    $cb();
                                }, defer.reject);
                            }
                        }, function ($err, $res) {

                            if ($err) {

                                defer.reject(new Error($err));
                            }
                            else {

                                var i = 0;
                                const keys = Object.keys(mediaQueries);
                                const l = keys.length;
                                while (i < l) {

                                    cssFile += mediaQueries[keys[i]].query + '{' + mediaQueries[keys[i]].css + '}';
                                    i++;
                                }


                                $requestState.httpStatus = 200;
                                $requestState.responseType = 'text/css';
                                $requestState.responseBody = cssFile.replace(/[\r\n]/gi, '');
                                defer.resolve();
                            }
                        });
                });
            });
        }, defer.reject);
        
        return defer.promise;
    };
};

var _newCSS
= me.newCSS = function f_css_newCSS($requestState) {
    
    return new _CSS($requestState);
};
