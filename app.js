/**
 * Github Burndown
 */

var Client = require('github'),
    readline = require('readline'),
    async = require('async'),
    flatfile = require('flat-file-db'),
    moment = require('moment'),
    Table = require('cli-table');

var db = flatfile.sync('cache.db');

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var github = new Client({
    debug: false,
    version: "3.0.0"
});

var debug = false;

/**
 * Set these values based on project specific
 * details.
 */

var project = {
  repo: 'Fortune-Gate',    // repo name
  user: 'clevertech',      // user/organization
  milestone: 'Sprint 19',  // current milestone
  startDate: '2015-5-15'   // milestone start date (YYYY-MM-DD)
}

function fetchGithub() {
  var page = 1;

  rl.question("GitHub user name: ", function(answer) {
    hidden("Password: ", function(answer2) {
      github.authenticate({
          type: "basic",
          username: answer,
          password: answer2
      });

      var issues = [];
      var lastLength = 0;

      github.issues.getAllMilestones({repo: project.repo, user: project.user, state: 'open'}, function(errM, milestones) {
        var milestone = null;

        milestones.forEach(function(m) {
          if(m.title === project.milestone)
            milestone = m;
        });

        async.forever(
          function(callback) {
            github.issues.repoIssues({repo: project.repo, user: project.user, state: 'all', milestone: milestone.number, per_page: 100, page: page++}, function(err, res) {
              if(!res) return callback(new Error('Empty response.'));
              if(!res.length) return callback(new Error('Empty response.'));

              issues = issues.concat(res);

              console.log('.')

              if(res.length < 100) return callback(new Error('Empty response.'));

                callback(err);

            });
          }, function(err) {
            // done
            console.log('Done fetching.')

            db.put('issues', issues);
            processTickets(issues);

        });
      });

      rl.close();
    });
  });
}

function flattenLabels(issue) {
  var labels = [];

  issue.labels.forEach(function(label) {
    labels.push(label.name)
  });

  return labels;
}

function getHours(issue) {
  var hours = 0;

  issue.labels.forEach(function(label) {
    switch(label.name) {
    case 'est-64': hours += 64; break;
    case 'est-32': hours += 32; break;
    case 'est-16': hours += 16; break;
    case 'est-8': hours  += 8; break;
    case 'est-4': hours  += 4; break;
    case 'est-2': hours  += 2; break;
    case 'est-1': hours  += 1; break;
    }
  });

  return hours;
}

function getBusinessDays(start, end) {
  var first = start.clone().endOf('week');
  var last = end.clone().startOf('week');
  var days = last.diff(first,'days') * 5 / 7;
  var wfirst = first.day() - start.day();
  if(start.day() == 0) --wfirst;
  var wlast = end.day() - last.day();
  if(end.day() == 6) --wlast;
  return wfirst + days + wlast;
  return 1;
}

function addBusinessDays(date, days) {
  date = moment(date); // use a clone
  while (days > 0) {
    date = date.add(1, 'days');
    // decrease "days" only if it's a weekday.
    if (date.isoWeekday() !== 6 && date.isoWeekday() !== 7) {
      days -= 1;
    }
  }
  return date;
}

function processTickets(issues) {
  var stats = {
    open: 0,
    closed: 0,
    test: 0,
    new: 0,
    inProgress: 0,
    hoursOpen: 0,
    hoursNew: 0,
    hoursClosed: 0,
    hoursInProgress: 0,
    hoursTest: 0,
    todayClosed: 0,
    todayTest: 0
  }

  issues.forEach(function(issue) {

    issue.labelList = flattenLabels(issue);
    issue.hours = getHours(issue);

    if(issue.state === 'open'){

      if(issue.labelList.indexOf('stt-test') !== -1) {
        stats.test++;
        stats.hoursTest += issue.hours;
      }else{
        stats.open++;
        stats.hoursOpen += issue.hours;
      }

      if(issue.labelList.indexOf('stt-new') !== -1) {
        stats.new++;
        stats.hoursNew += issue.hours;
      }

      if(issue.labelList.indexOf('stt-in-progress') !== -1) {
        stats.inProgress++;
        stats.hoursInProgress += issue.hours;
      }
    }else{
      stats.closed++;
      stats.hoursClosed += issue.hours;
    }
  });

  var startDate = moment(project.startDate, 'YYYY-MM-DD');
  var workedDays = getBusinessDays(startDate, moment());

  var rate1 = {}, rate2 = {}, rate3 = {};

  rate1.burndownRate = (stats.hoursClosed + stats.hoursTest + stats.hoursInProgress) / workedDays;
  rate1.endDate = addBusinessDays(moment(), stats.hoursOpen / rate1.burndownRate);

  rate2.burndownRate = (stats.hoursClosed + stats.hoursTest) / workedDays;
  rate2.endDate = addBusinessDays(moment(), stats.hoursOpen / rate2.burndownRate);

  rate3.burndownRate = (stats.hoursClosed) / workedDays;
  rate3.endDate = addBusinessDays(moment(), stats.hoursOpen / rate3.burndownRate);


  // draw table

  var table = new Table({
      head: ['Tickets', ''],
      colWidths: [30, 45]
  });



  table.push(
      ['Open', stats.open + ' tickets (' + stats.hoursOpen + 'h)'],
      //['New', stats.new + ' tickets (' + stats.hoursNew + 'h)'],
    ['In Progress', stats.inProgress + ' tickets (' + stats.hoursInProgress + 'h)'],
    ['Test', stats.test + ' tickets (' + stats.hoursTest + 'h)'],
    ['Closed', stats.closed + ' tickets (' + stats.hoursClosed + 'h)']
  );

  console.log('```');
  console.log(table.toString());
  console.log('```');
  console.log('');

  table.push(
    ['Worked days', workedDays],
    ['Test + Closed',               'End: ' + rate2.endDate.format('MMMM Do, YYYY') +
                    ' (at ' + rate2.burndownRate.toFixed(2) + 'h/day' + ')'],
    ['Closed',                      'End: ' + rate3.endDate.format('MMMM Do, YYYY') +
                    ' (at ' + rate3.burndownRate.toFixed(2) + 'h/day' + ')']
  );

  console.log('```');
  console.log(table.toString());
  console.log('```');
}


function hidden(query, callback) {
  var stdin = process.openStdin();
  process.stdin.on("data", function(char) {
    char = char + "";
    switch (char) {
      case "\n":
      case "\r":
      case "\u0004":
        stdin.pause();
        break;
      default:
        process.stdout.write("\033[2K\033[200D" + query + Array(rl.line.length+1).join("*"));
        break;
    }
  });

  rl.question(query, function(value) {
    rl.history = rl.history.slice(1);
    callback(value);
  });
}


var cachedIssues = db.get('issues');

if(!cachedIssues || !debug)
  fetchGithub();
else
  processTickets(cachedIssues);
