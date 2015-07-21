'use strict';

var AWS = require('aws-sdk');
var git = require('git-rev');
var fs = require('fs');
var Q = require('q');
var _ = require('lodash');
var gutil = require('gulp-util');
var through = require('through2');

module.exports = function(config) {
  
  config = _.extend({
    region: 'us-east-1'
  }, config);

  function deploy(file, enc, callback) {
    
    if (config.profile) {
      AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile: config.profile });
      gutil.log('Using credentials from profile \'' + config.profile + '\'');
    }

    var iam = new AWS.IAM();

    iam.getUser({}, function(err, data) {

      if (err) {
        callback(new gutil.PluginError('gulp-eb-deploy', err));
      } else {

        git.short(function(rev) { 

          var date = new Date();
          var y = date.getFullYear();
          var m = date.getMonth() + 1;
          var d = date.getDate();

          var version = String(y) +
            String(m = (m < 10) ? ('0' + m) : m) +
            String(d = (d < 10) ? ('0' + d) : d) +
            '-' + rev +
            '-' + Math.floor((Math.random() * 899999) + 100000);

          var label = config.application + '-' + version;

          var account = data.User.Arn.split(/:/)[4];
          var bucket = 'elasticbeanstalk-' + config.region + '-' + account;

          var s3obj = new AWS.S3({ params: { Bucket: bucket, Key: label + '.zip' } });

          gutil.log('Uploading application bundle');
          s3obj.upload({ Body: file.contents }).send(function(err, data) {

            if (err) {
              callback(new gutil.PluginError('gulp-eb-deploy', err));
            } else {

              gutil.log('Creating application version \'' + label + '\'');
              var eb = new AWS.ElasticBeanstalk({ region: config.region });

              eb.createApplicationVersion({
                ApplicationName: config.application,
                VersionLabel: label,
                SourceBundle: {
                  S3Bucket: bucket,
                  S3Key: label + '.zip'
                }
              }, function (err, data) {

                if (err) {
                  callback(new gutil.PluginError('gulp-eb-deploy', err));
                } else {

                  gutil.log('Updating environment \'' + config.environment + '\' to version \'' + label + '\'');
                  eb.updateEnvironment({
                    EnvironmentName: config.environment,
                    VersionLabel: label
                  }, function (err, data) {
                    if (err) {
                      callback(new gutil.PluginError('gulp-eb-deploy', err));
                    } else {
                      gutil.log('Environment update running, please check AWS console for progress');
                      callback();
                    }
                  });

                }

              });

            }

          });

        });

      }

    });

  }

  return through.obj(deploy);

}

