/**
 * UserController
 *
 * @module      ::  Controller
 * @description ::  Contains logic for handling requests.
 */
var async = require("async");
var moment = require("moment-timezone");
var languages = require("./../../config/i18n.js");

module.exports = {
    /**
     * User add action.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    add: function(req, res) {
        res.view({
            languages: languages.i18n.locales,
            timezones: DateService.getTimezones(),
            layout: req.isAjax ? "layout_ajax" : "layout"
        });
    },

    /**
     * User edit action.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    edit: function(req, res) {
        var userId = req.param("id");

        // Fetch user data
        User
            .findOne(userId)
            .done(function(error, user) {
                if (error) {
                    res.send(error, 500);
                } else if (!user) {
                    res.send("User not found.", 404);
                } else {
                    res.view({
                        user: user,
                        languages: languages.i18n.locales,
                        timezones: DateService.getTimezones(),
                        layout: req.isAjax ? "layout_ajax" : "layout"
                    });
                }
            });
    },

    /**
     * User list action.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    list: function(req, res) {
        // Fetch user data
        User
            .find()
            .sort("lastName ASC")
            .sort("firstName ASC")
            .sort("username ASC")
            .done(function(error, users) {
                if (error) {
                    res.send(error, 500);
                } else {
                    // Map user
                    async.map(
                        users,
                        function(user, callback) {
                            // Fetch user last sign in record
                            UserLogin
                                .findOne({
                                    userId: user.id
                                })
                                .sort("stamp DESC")
                                .limit(1)
                                .done(function(error, loginData) {
                                    if (error) {
                                        callback(error, null);
                                    } else {
                                        // Add last login to user data
                                        user.lastLogin = (!loginData) ? null : loginData.stamp;

                                        if (user.lastLogin !== null) {
                                            moment.lang(req.user.language);

                                            user.lastLogin = DateService.convertDateObjectToUtc(user.lastLogin);
                                            user.lastLogin.tz(req.user.momentTimezone);
                                        }

                                        callback(null, user);
                                    }
                                });
                        },
                        function(error, users) {
                            if (error) {
                                res.send(error, error.status ? error.status : 500);
                            } else {
                                res.view({
                                    layout: req.isAjax ? "layout_ajax" : "layout",
                                    users: users,
                                    moment: moment
                                });
                            }
                        }
                    );
                }
            });
    },

    /**
     * User sign in history action.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    history: function(req, res) {
        var userId = req.param("id");

        async.parallel(
            {
                // Fetch single user data
                user: function(callback) {
                    DataService.getUser(userId, callback);
                },

                // Fetch user sign in data
                history: function(callback) {
                    DataService.getUserSignInData(userId, callback);
                }
            },
            function (error, data) {
                if (error) {
                    res.send(error, error.status ? error.status : 500);
                } else {
                    data.layout = req.isAjax ? "layout_ajax" : "layout";

                    moment.lang(req.user.language);

                    // Iterate sign in rows and make formatted stamp
                    _.each(data.history, function(row) {
                        row.stamp = DateService.convertDateObjectToUtc(row.stamp);
                        row.stamp.tz(req.user.momentTimezone);
                    });

                    // Group sign in data by IP addresses
                    data.ipData = _.groupBy(data.history, function(row) {
                        return row.ip;
                    });

                    // Group sign in data by user agents
                    data.agentData = _.groupBy(data.history, function(row) {
                        return row.agent;
                    });

                    res.view(data);
                }
            }
        );
    },

    /**
     * User projects action. Basically this action will show all projects that current user
     * is affected to in some role.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    projects: function(req, res) {
        var userId = req.param("id");

        async.parallel(
            {
                // Fetch single user data
                user: function(callback) {
                    DataService.getUser(userId, callback);
                },

                // Fetch user sign in data
                projects: function(callback) {
                    DataService.getProjects({}, callback);
                }
            },
            function (error, data) {
                if (error) {
                    res.send(error, error.status ? error.status : 500);
                } else {
                    moment.lang(req.user.language);

                    async.filter(
                        data.projects,
                        function(project, callback) {
                            AuthService.hasProjectAccess(data.user, project.id, function(error, role) {
                                if (role !== false) {
                                    project.role = role;
                                    project.roleText = "Unknown";

                                    project.dateStart = DateService.convertDateObjectToUtc(project.dateStart);
                                    project.dateStart.tz(req.user.momentTimezone);

                                    project.dateEnd = DateService.convertDateObjectToUtc(project.dateEnd);
                                    project.dateEnd.tz(req.user.momentTimezone);

                                    switch (project.role) {
                                        case -3:
                                            project.roleText = "Administrator";
                                            break;
                                        case -2:
                                            project.roleText = "Manager (Primary)";
                                            break;
                                        case -1:
                                            project.roleText = "Manager";
                                            break;
                                        case 0:
                                            project.roleText = "Viewer";
                                            break;
                                        case 1:
                                            project.roleText = "User";
                                            break;
                                    }

                                    callback(true);
                                } else {
                                    callback(false);
                                }
                            }, true);
                        },
                        function(projects) {
                            data.projects = projects;
                            data.layout = req.isAjax ? "layout_ajax" : "layout";

                            res.view(data);
                        }
                    );
                }
            }
        );
    },

    /**
     * User password change action.
     *
     * todo add support for admin users to change anyone password
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    changePassword: function(req, res) {
        var userId = req.param("userId");
        var passwordCurrent = req.param("passwordCurrent");
        var passwordNew = req.param("password");
        var passwordReType = req.param("passwordReType");

        if (passwordNew !== passwordReType) {
            return res.send(400, "Given passwords doesn't match.");
        } else if (passwordNew.length < 10) {
            return res.send(400, "Given new password is too short.");
        } else if (passwordCurrent.length < 10) {
            return res.send(400, "Given current password is too short.");
        }

        // Get user object
        DataService.getUser(userId, function(error, user) {
            if (error) {
                return res.send(error.status ? error.status : 500, error.message ? error.message : error);
            } else if (!user) {
                return res.send(404, "User not found");
            } else if (!user.validPassword(passwordCurrent)) {
                return res.send(400, "Given current password value doesn't match.");
            } else {
                // Set new password value for user
                user.password = passwordNew;

                user.save(function(error) {
                    if (error) {
                        return res.send(error.status ? error.status : 500, error.message ? error.message : error);
                    } else {
                        return res.json(true);
                    }
                });
            }
        });
    }
};
