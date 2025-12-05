/*global requirejs,console,define,fs*/
define([
  'commander',
  'superagent',
  '../../lib/config',
  '../../lib/cache',
  'async',
  'url',
  '../../lib/auth'
], function (program, request, config, cache, async, url, Auth) {

  var create = {
    query: null,
    table: null,
    isSubTask: false,
    projects: [],
    priorities: [],
    answers: {
      fields: {}
    },

    ask: function (question, callback, yesno, values, answer) {
      var that = this,
        options = options || {},
        issueTypes = [],
        i = 0;

      if(answer || answer===false){
        return callback(answer);
      }
      if (values && values.length > 0) {
        for (i; i < values.length; i++) {
          if (that.isSubTask) {
            if (values[i].subtask !== undefined) {
              if (values[i].subtask) {
                issueTypes.push('(' + values[i].id + ') ' + values[i].name);
              }
            } else {
              issueTypes.push('(' + values[i].id + ') ' + values[i].name);
            }
          } else {
            if (!values[i].subtask) {
              issueTypes.push('(' + values[i].id + ') ' + values[i].name);
            }
          }
        }
        console.log(issueTypes.join('\n'));
      }

      program.prompt(question, function (answer) {
        if (answer.length > 0) {
          callback(answer);
        } else {
          if (yesno) {
            callback(false);
          } else {
            that.ask(question, callback);
          }
        }
      }, options);
    },

    askProject: function (project, callback) {
      var that = this,
        i = 0;

      this.ask('Type the project name or key: ', function (answer) {
        var projectId = 0,
          index = 0;

        answer = answer.charAt(0).toUpperCase() + answer.substring(1).toLowerCase();

        for (i; i < that.projects.length; i++) {
          if (answer == that.projects[i].key ||answer.toUpperCase() == that.projects[i].key) {
            projectId = that.projects[i].id;
            index = i;
          } else if (answer == that.projects[i].name) {
            projectId = that.projects[i].id;
            index = i;
          }
        }

        if (projectId > 0) {
          callback(projectId, index);
        } else {
          console.log('Project "' + answer + '" does not exists.');
          that.askProject(project, callback);
        }
      }, null, null, project);
    },

    askSubTask: function (subtask, callback) {
      var that = this;

      that.ask('Type the parent task key (only the numbers) if exists, otherwise press enter: ', function (answer) {
        if (answer === false || parseInt(answer) > 0) {
          that.isSubTask = (answer) ? true : false;
          callback(answer);
        } else {
          console.log('Please, type only the task number (ex: if issue is "XXX-324", type only "324").');
          that.askSubTask(subtask, callback);
        }
      }, true, null, subtask);
    },

    askIssueType: function (type, callback) {
      var that = this,
        issueTypeArray = that.project.issuetypes;

      that.ask('Select issue type: ', function (issueType) {
        callback(issueType);
      }, false, issueTypeArray, type);
    },

    askIssuePriorities: function (priority, callback) {
      var that = this,
        issuePriorities = that.priorities;


      that.ask('Select the priority: ', function (issuePriority) {
        callback(issuePriority);
      }, false, issuePriorities, priority);
    },

    newIssue: function (projIssue, options) {
      var that = this;
      var project = typeof(projIssue) === 'string' ? projIssue : undefined;
      var parent = undefined;
      if (project !== undefined) {
        var split = project.split('-');
        project = split[0];
        if (split.length > 1) {
          parent = split[1];
          console.log("Creating subtask for issue " + projIssue);
        } else {
          console.log("Creating issue in project " + project);
        }
      }

      this.createIssueForProject = function createIssueForProject(that) {
        that.askIssueType(options.type ,function (issueTypeId) {
          that.answers.fields.issuetype = {
            id: issueTypeId
          };

          that.ask('Issue title: ', function (issueTitle) {
            that.answers.fields.summary = issueTitle;
            that.ask('Issue description: ', function (issueDescription) {
              that.answers.fields.description = issueDescription || issueTitle;

              that.askIssuePriorities(options.priority, function (issuePriority) {
                that.answers.fields.priority = {
                  id: issuePriority
                };

                that.ask('Issue assignee (Enter for none): ', function (assignee) {
                  if (assignee) {
                    that.answers.fields.assignee = {
                      name: assignee == "me" ? config.auth.user : assignee
                    }
                  }

                  that.saveIssue(function(res) {
                    that.ask('Create another issue? [y/N] ', function (answer) {
                      if (answer && answer.toLowerCase()[0] == 'y') {
                        that.createIssueForProject(that);
                      } else {
                        process.stdin.destroy();
                      }
                    }, true);
                  });
                }, true, [], {user: {enabled: true}}, options.assignee);

              });
            }, true, null, options.description);
          }, null, null, options.title);
        });
      }

      this.getMeta(function (meta) {
        that.projects = meta;

        that.getPriorities(function (priorities) {
          that.priorities = priorities;

          that.askProject(options.project, function (projectId, index) {
            that.project = that.projects[index];
            that.answers.fields.project = {
              id: projectId
            };
            if(!options.subtask && (options.priority || options.type || options.title || options.description)){
              options.subtask=false;
            }
            that.askSubTask(options.subtask, function (taskKey) {
              if (taskKey) {
                that.answers.fields.parent = {
                  key: that.project.key + '-' + taskKey
                };
              }

              that.askIssueType(options.type, function (issueTypeId) {
                that.answers.fields.issuetype = {
                  id: issueTypeId
                };

                that.ask('Type the issue title: ', function (issueTitle) {
                  that.answers.fields.summary = issueTitle;

                  that.ask('Type the issue description: ', function (issueDescription) {
                    var defaultAnswer = issueTitle;
                    if (!issueDescription) {
                        that.answer.fields.description = defaultAnswer;
                    } else {
                        that.answers.fields.description = issueDescription;
                    }

                    that.askIssuePriorities(options.priority, function (issuePriority) {
                      that.answers.fields.priority = {
                        id: issuePriority
                      };

                      process.stdin.destroy();
                      that.saveIssue();
                    });
                  }, null, null, options.description);
                }, null, null, options.title);
              });
            });
          });
        });
      });
    },

    // Capability-detect meta loader:
    // - Try Jira 8.4+ project-scoped createmeta endpoints first.
    // - If they 404, fall back to legacy global createmeta.
    getMeta: function (callback) {
      var cachedRes = cache.getSync('meta', 'project', 1000*60*60*24*7);
      if (cachedRes) {
        return callback(cachedRes);
      }

      var baseUrl = config.auth.url;
      var authHeader = Auth.getAuthorizationHeader();

      var useLegacy = function () {
        request
          .get(baseUrl + 'rest/api/2/issue/createmeta')
          .set('Content-Type', 'application/json')
          .set('Authorization', authHeader)
          .end(function (res) {
            if (!res.ok) {
              return console.log((res.body && res.body.errorMessages ? res.body.errorMessages : [res.error]).join('\n'));
            }
            cache.set('meta', 'project', res.body.projects);
            callback(res.body.projects);
          });
      };

      var useNew = function () {
        request
          .get(baseUrl + 'rest/api/2/project')
          .set('Content-Type', 'application/json')
          .set('Authorization', authHeader)
          .end(function (res) {
            if (!res.ok) {
              return console.log((res.body && res.body.errorMessages ? res.body.errorMessages : [res.error]).join('\n'));
            }

            var rawProjects = res.body || [];

            async.mapLimit(rawProjects, 5, function (p, done) {
              request
                .get(baseUrl + 'rest/api/2/issue/createmeta/' + p.key + '/issuetypes')
                .set('Content-Type', 'application/json')
                .set('Authorization', authHeader)
                .end(function (r2) {
                  var status = r2 && (r2.status || (r2.res && r2.res.statusCode));

                  if (!r2.ok) {
                    // If the new endpoint is not available, fall back to legacy.
                    if (status === 404) {
                      var err = new Error('NEEDS_LEGACY_CREATEMETA');
                      err.code = 'NEEDS_LEGACY_CREATEMETA';
                      return done(err);
                    }

                    return done(null, {
                      id: p.id,
                      key: p.key,
                      name: p.name,
                      issuetypes: []
                    });
                  }

                  // Normalize response shape for issuetypes
                  var body = r2.body || {};
                  var types = [];

                  if (Array.isArray(body)) {
                    types = body;
                  } else if (Array.isArray(body.issuetypes)) {
                    types = body.issuetypes;
                  } else if (Array.isArray(body.values)) {
                    types = body.values;
                  } else if (body.values && Array.isArray(body.values.values)) {
                    types = body.values.values;
                  }

                  var normalizedTypes = (types || []).map(function (t) {
                    return {
                      id: t.id,
                      name: t.name,
                      subtask: t.subtask
                    };
                  });

                  done(null, {
                    id: p.id,
                    key: p.key,
                    name: p.name,
                    issuetypes: normalizedTypes
                  });
                });
            }, function (err, projects) {
              if (err && err.code === 'NEEDS_LEGACY_CREATEMETA') {
                return useLegacy();
              }
              if (err) {
                return console.log(err.message || err);
              }

              cache.set('meta', 'project', projects);
              callback(projects);
            });
          });
      };

      useNew();
    },

    getPriorities: function (callback) {
      this.query = 'rest/api/2/priority';
      var cachedRes = cache.getSync('meta', 'priorities', 1000*60*60*24*7);
      if(cachedRes){
        return callback(cachedRes);
      }

      request
        .get(config.auth.url + this.query)
        .set('Content-Type', 'application/json')
        .set('Authorization', Auth.getAuthorizationHeader())
        .end(function (res) {
          if (!res.ok) {
            return console.log(res.body.errorMessages.join('\n'));
          }
          cache.set('meta', 'priorities', res.body);
          callback(res.body);
        });
    },

    saveIssue: function () {
      this.query = 'rest/api/2/issue';
      request
        .post(config.auth.url + this.query)
        .send(this.answers)
        .set('Content-Type', 'application/json')
        .set('Authorization', Auth.getAuthorizationHeader())
        .end(function (res) {
          if (!res.ok) {
            return console.log(res.body.errorMessages.join('\n'));
          }

          return console.log('Issue ' + res.body.key + ' created successfully!');

        });
    }
  };

  return create;

});
