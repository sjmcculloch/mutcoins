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
const ampify = require('ampify');
var cheerio = require('cheerio');
var request = require('sync-request');
var sizeOf = require('image-size');

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
  var dir = './dist/amp';
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }

  var css = fs.readFileSync('./dist/css/style.css', { encoding: 'utf8' });
  var posts = JSON.parse( fs.readFileSync('./api/posts.json', { encoding: 'utf8' }));
  for (var item = 0; item < posts.length; item++) {
    var res = env.render('pages/post.html', posts[item]);
    fs.writeFile('dist/' + posts[item].slug + '.html', res);
  }

  gulp.src("./dist/*.html")
    .pipe(prettyUrl())
    .pipe(gulp.dest("./dist"));


  // generate AMP
  /*
  for (var item = 0; item < posts.length; item++) {
    var post = posts[item];
    post.body = marked(posts[item].body);
    post.body =  post.body.replace(/img src="\/\//g, 'img src="https://');
    post.body = ampify(post.body, {cwd: 'amp'});

    var res = env.render('pages/amp.html', post);
    fs.writeFile('dist/amp/' + posts[item].slug + '.html', res);
  }

  gulp.src("./dist/amp/*.html")
    .pipe(prettyUrl())
    .pipe(gulp.dest("./dist/amp"));

*/

  var $, round;
  var options = options || {};

  options.normalizeWhitespace = options.normalizeWhitespace || false;
  options.xmlMode = options.xmlMode || false;
  options.decodeEntities = options.decodeEntities || false;

  options.cwd = options.cwd || '';
  options.round = options.round || true;


  if (options.round) {
    round = function(numb) { return Math.round(numb / 5) * 5; }
  }
  else {
    round = function(numb) { return numb; }
  }

  for (var item = 0; item < posts.length; item++) {

    var post = posts[item];
    post.body = marked(posts[item].body);
    $ = cheerio.load(post.body, options);

    $('img:not(width):not(height)').each(function() {
      var src = $(this).attr('src');
      if (!src) {
        return $(this).remove();
      }

      if (src.indexOf('//') != -1) {
        var imageUrl = this.attribs.src;
        if( src.indexOf('//') == 0 ) {
          imageUrl = "https:" + imageUrl;
        }

        $(this).attr({
          layout: 'responsive'
        });
        var response = request('GET', imageUrl);
        if (response.statusCode === 200) {
          var size = sizeOf(response.body);
          $(this).attr({
            width: round(size.width),
            height: round(size.height)
          });
        }
      };
    });

    post.body = $.html();
    var res = env.render('pages/amp.html', post);
    fs.writeFile('dist/amp/' + posts[item].slug + '.html', res);
  }

});

gulp.task('generate-recent-blogs', function () {
  var posts = JSON.parse( fs.readFileSync('./api/posts.json', { encoding: 'utf8' }));
  posts.sort(function(a,b) {return (a.date < b.date) ? 1 : ((b.date < a.date) ? -1 : 0);} );
  res = env.render('pages/post-recent.html', {posts: posts});
  fs.writeFileSync('views/partials/dynamic/post-recent.html', res);
});

gulp.task('generate-sitemap', function () {
  var posts = JSON.parse( fs.readFileSync('./api/posts.json', { encoding: 'utf8' }));
  res = env.render('pages/sitemap.xml', {posts: posts});
  fs.writeFileSync('dist/sitemap.xml', res);
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

gulp.task('scripts', () =>
  gulp.src(['js/**/*'])
    .pipe(gulp.dest('dist/js'))
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

gulp.task('scripts:watch', () =>
  gulp.watch('js/**/*', ['scripts'])
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
gulp.task('watch', ['styles:watch', 'scripts:watch', 'templates:watch']);

gulp.task('build:local', function(callback) {
  runSequence(
    'clean', 
    'styles',
    'generate-recent-blogs',
    'generate-blogs',
    'generate-sitemap',
    'generate',
    'images',
    'scripts',
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
