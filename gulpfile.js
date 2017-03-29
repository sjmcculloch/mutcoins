const path = require('path');
const fs = require('fs');
const gulp = require('gulp');
const data = require('gulp-data');
const nunjucks = require('gulp-nunjucks');
const fm = require('front-matter');
const clean = require('gulp-clean');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const webserver = require('gulp-webserver');
const prettyUrl = require("gulp-pretty-url");
const runSequence = require('run-sequence');
const contentful = require('contentful');
const stringify = require('json-stringify-safe');
var dateFilter = require('nunjucks-date-filter');
const markdown = require('nunjucks-markdown');
const marked = require('marked');
var replace = require('gulp-replace');

// Add a custom nunjucks environment for custom filters
const nunj = require('nunjucks');
nunj.configure('views', {watch: false});

var env = new nunj.Environment(new nunj.FileSystemLoader('views', { noCache: true, watch: false }), { autoescape: false }); 
env.addFilter('date', dateFilter);
markdown.register(env, marked);

// Compile the views with the data found in the api sepcified in
// the template's front-matter.
// Additional data can be passed in the front-matter
gulp.task('generate', () =>
  gulp.src(['views/*.html'])
    .pipe(data(function(file) {
      var content = fm(String(file.contents));
      var apiData = {};
      var apiUrls = []; // for our configs file in view.js
      for (var i = 0; i < content.attributes.api.length; i++) {
        var source = content.attributes.api[i].split(".json")[0].split("/")[1]; // better with a regexp.
        apiUrls.push(content.attributes.api[i]);
        apiData[source] = require("./" + content.attributes.api[i]);
      }
      content.attributes.api = apiData;
      content.attributes.baseTemplate = "./layouts/base.html";
      return content.attributes;
    }))
    .pipe(nunjucks.compile(null, {"env" : env}))
    .pipe(prettyUrl())
    .pipe(gulp.dest('dist', {overwrite: true}))
);


gulp.task('generate-blogs', function () {
  var css = fs.readFileSync('./dist/css/style.css', { encoding: 'utf8' });
  var posts = JSON.parse( fs.readFileSync('./api/posts.json', { encoding: 'utf8' }));
  for (var item = 0; item < posts.length; item++) {
    var res = env.render('pages/post.html', posts[item]);

    fs.writeFile('dist/' + posts[item].slug + '.html', res, function(err) {
        if(err) {
            return console.log('Unable to write file ' + err);
        }
    });
  }

  gulp.src("./dist/*.html")
    .pipe(prettyUrl())
    .pipe(gulp.dest("./dist"));
});


gulp.task('generate-recent-blogs', function () {
  var posts = JSON.parse( fs.readFileSync('./api/posts.json', { encoding: 'utf8' }));
  res = env.render('pages/post-recent.html', {posts: posts});

  fs.writeFile('views/partials/dynamic/post-recent.html', res, function(err) {
      if(err) {
          return console.log('Unable to write file ' + err);
      }
  });

});

// set up the contentful query client
// readonly access from these creds
var client = contentful.createClient({
  space: 'nso7hcqr5tuu', 
  accessToken: '5f6e61df9e7b247fcbaf7e501e93f1c97756279dcc91742a62139beab475f854'
});

// Clean up output directories
gulp.task('clean', function () {
  return gulp.src('dist/*', {read: false})
    .pipe(clean());
});

gulp.task('clean-temp', function () {
  return gulp.src('temp/*', {read: false})
    .pipe(clean());
});

// Get the posts data from the cloud CMS and stash it locally
gulp.task('get:posts', () =>
  client.getEntries({'content_type':'2wKn6yEnZewu2SCCkus4as'})
    .then(
      function(resp) {
        var dataObject = [];
        for (var item = 0; item < resp.items.length; item++) {
          dataObject.push(resp.items[item].fields)
        }
        fs.writeFileSync('api/posts.json', stringify(dataObject, null, 2)); 
      }
    )
);


// Get data from the cloud CMS and stash it locally
gulp.task('get', ['get:posts']);

// Combine and compress javascript
gulp.task('images', () =>
  gulp.src(['images/**/*'])
    .pipe(gulp.dest('dist/images'))
);

// Combine and compress javascript
gulp.task('styles', () =>
  gulp.src(['css/**/*'])
    .pipe(gulp.dest('dist/css'))
);


// Ensure any config files make to the dist folder
gulp.task('configs', () =>
  gulp.src(['_redirects','browserconfig.xml','manifest.json'])
    .pipe(gulp.dest('dist'))
);

// Watchers
gulp.task('styles:watch', () =>
  gulp.watch('css/**/*', ['styles'])
);

gulp.task('templates:watch', () =>
  gulp.watch('views/**/*.html', ['generate', 'generate-blogs'])
);

// serve the static dist folder
gulp.task('serve', function() {
  gulp.src('dist')
    .pipe(webserver({
      livereload: true,
      open: true
    }));
});

gulp.task('default', ['build:local']);
gulp.task('watch', ['styles:watch', 'templates:watch']);

gulp.task('build:local', function(callback) {
  runSequence(
    'clean', 
    'clean-temp',
    'styles',
    'generate-recent-blogs',
    'generate-blogs',
    'generate',
    'images',
    callback
  );
});

gulp.task('build:serve', function(callback) {
  runSequence(
    'build:local',
    'watch',
    'serve',
    callback
  );
});

gulp.task('build:prod', function(callback) {
  runSequence(
    'get',
    'build:local',
    callback
  );
});