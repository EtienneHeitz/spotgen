/* global jQuery:true */
/* exported jQuery */

var http = require('./http')
var util = require('./util')
var URI = require('urijs')
var $ = require('jquery')
jQuery = $

/**
 * Create a web scraper.
 * @constructor
 * @param {string} uri - The URI of the web page to scrape.
 */
function WebScraper (uri, count, parser) {
  /**
   * Number of pages to fetch.
   */
  this.count = 0

  /**
   * Parser instance to handle the generator string.
   */
  this.parser = null

  /**
   * The URI of the first page to fetch.
   */
  this.uri = uri

  this.count = count || this.count
  this.parser = parser
}

/**
 * Scrape a web page.
 *
 * This function inspects the host of the web page and invokes an
 * appropriate scraping function. The scraping functions are written
 * in the following manner: they take the web page URI as input,
 * fetch the page, and return a generator string as output (wrapped
 * in a Promise). Schematically:
 *
 *           web page:                      generator string
 *     +-------------------+                   (Promise):
 *     | track1 by artist1 |    scraping
 *     +-------------------+    function    artist1 - track1
 *     | track2 by artist2 |    =======>    artist2 - track2
 *     +-------------------+                artist3 - track3
 *     | track3 by artist3 |
 *     +-------------------+
 *
 * In the example above, the scraping function converts a table of
 * tracks to a generator string on the form `ARTIST - TRACK`. If the
 * input were an albums chart, then the output would be a string of
 * `#album` commands instead. In other words, the scraping function
 * should extract the *meaning* of the web page and express it as
 * input to the generator.
 *
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} count - Number of pages to fetch.
 * @return {Promise | string} A generator string.
 */
WebScraper.prototype.scrape = function (uri, count) {
  var domain = URI(uri).domain()
  if (domain === 'last.fm') {
    return this.lastfm(uri, count)
  } else if (domain === 'pitchfork.com') {
    return this.pitchfork(uri, count)
  } else if (domain === 'rateyourmusic.com') {
    return this.rateyourmusic(uri, count)
  } else if (domain === 'reddit.com') {
    return this.reddit(uri, count)
  } else if (domain === 'youtube.com') {
    return this.youtube(uri)
  } else {
    return this.webpage(uri)
  }
}

/**
 * Create a queue of tracks.
 * @param {string} result - A newline-separated list of tracks.
 * @return {Promise | Queue} A queue of results.
 */
WebScraper.prototype.createQueue = function (result) {
  var collection = this.parser.parse(result)
  return collection.dispatch()
}

/**
 * Dispatch entry.
 * @return {Promise | Queue} A queue of results.
 */
WebScraper.prototype.dispatch = function () {
  var self = this
  return this.scrape(this.uri, this.count).then(function (result) {
    return self.createQueue(result)
  })
}

/**
 * Scrape a Last.fm tracklist.
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} [count] - The number of pages to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.lastfm = function (uri, count) {
  count = count || 1
  
  function getPages (nextUri, result, count, urls) {    
    nextUri = URI(nextUri).absoluteTo(uri).toString()
    console.log(nextUri + '\n')
    
    var nextUrls = urls || []

    var urlParams = new URLSearchParams(new URL(nextUri).search)
    var nbTracks = parseInt(urlParams.get('nb_tracks'))
    var nbSimilarTracks = parseInt(urlParams.get('nb_similar_tracks'))
    var nbSimilarArtists = parseInt(urlParams.get('nb_similar_artists'))
    var nbSimilarArtistsTracks = parseInt(urlParams.get('nb_similar_artists_tracks'))
    
    return http(nextUri).then(function (data) {
      var html = $($.parseHTML(data))
      var lines = ''
      if (nextUri.match(/\/\+tracks/gi)) {
        // tracks by a single artist
        var header = html.find('h1.header-new-title')
        var artist = util.normalize(header.first().text())
        
        var i = 0
        html.find('td.chartlist-name').each(function () {
          if (i === nbTracks)
            return false
          
          var song = artist + '\t-\t' + util.normalize($(this).text())
          //if (result.indexOf(song) === -1)
            lines += song + '\n'

          nextUrls.push('https://www.last.fm' + util.normalize($(this).find('a').attr('href')) + (!isNaN(nbSimilarTracks) ? '?nb_similar_tracks=' + nbSimilarTracks : ''))
          
          i++
        })

        if (!isNaN(nbSimilarArtists)) {            
            nextUrls.push(nextUri.replace('+tracks','+similar'))
        }
      } else if (nextUri.match(/\/\+similar/gi)) {
        // similar artists
        
        var i = 0
        html.find('h3.similar-artists-item-name').each(function () {
          //lines += '#top ' + util.normalize($(this).text()) + '\n'

          if (i === nbSimilarArtists)
            return false
          
          var nextUrl = new URL('https://www.last.fm' + util.normalize($(this).find('a').attr('href')) + '/+tracks')
          var nextUrlParams = new URLSearchParams(urlParams.toString())
            
          nextUrlParams.set('nb_tracks', nbSimilarArtistsTracks)
          nextUrlParams.delete('nb_similar_artists')
          nextUrlParams.delete('nb_similar_artists_tracks')
          nextUrl.search = nextUrlParams.toString()
                        
          nextUrls.push(nextUrl.toString())
          
          i++
        })
      } else if (nextUri.match(/\/artists/gi)) {
        // list of artists
        html.find('td.chartlist-name').each(function () {
          lines += '#top ' + util.normalize($(this).text()) + '\n'
        })
      } else if (nextUri.match(/\/albums/gi)) {
        // list of albums
        html.find('td.chartlist-name').each(function () {
          lines += '#album ' + util.normalize($(this).text()) + '\n'
        })
      } else {
        // similar tracks
        var i = 0
        html.find('.track-similar-tracks-item').each(function () {
          if (i === nbSimilarTracks)
            return false
            
          var artist = util.normalize($(this).find('p.track-similar-tracks-item-artist').text())
          var title = util.normalize($(this).find('h3.track-similar-tracks-item-name').text())
          lines += artist + '\t-\t' + title + '\n'
          
          i++
        })
      }
      console.log(util.stripWhitespace(lines, '\\t') + '\n')
      result += lines
      if (count === 1 && nextUrls.length === 0) {
        return result
      }
      else if (nextUrls.length > 0) {
        return getPages(nextUrls.shift(), result, 1, nextUrls)
      }
      else {
        /*var next = html.find('.pagination-next a')
        if (next.length > 0) {
          nextUri = next.attr('href')
          return getPages(nextUri, result, count - 1)
        } else {*/
          return result
        //}
      }
    })
  }
  return getPages(uri, '#shuffle\n', count)
}

/**
 * Scrape a Pitchfork list.
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} [count] - The number of pages to scrape.
 * @return {Promise | string} A newline-separated list of albums.
 */
WebScraper.prototype.pitchfork = function (uri, count) {
  count = count || 0
  function getPages (nextUri, result, count) {
    nextUri = URI(nextUri).absoluteTo(uri).toString()
    console.log(nextUri + '\n')
    return http(nextUri).then(function (data) {
      var html = $($.parseHTML(data))
      var lines = ''
      html.find('div[class*="artist-work"]').each(function () {
        var artist = util.normalize($(this).find('ul[class*="artist-list"] li:first').text())
        var album = util.normalize($(this).find('h2[class*="work-title"]').text())
        lines += '#album ' + artist + '\t-\t' + album + '\n'
      })
      console.log(util.stripWhitespace(lines, '\\t') + '\n')
      result += lines
      if (count === 1) {
        return result
      } else {
        var nextPage = html.find('.fts-pagination__list-item--active').next()
        if (nextPage.length > 0) {
          nextUri = nextPage.find('a').attr('href')
          return getPages(nextUri, result, count - 1)
        } else {
          return result
        }
      }
    })
  }
  return getPages(uri, '', count)
}

/**
 * Scrape a Rate Your Music chart.
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} [count] - The number of pages to scrape.
 * @return {Promise | string} A newline-separated list of albums.
 */
WebScraper.prototype.rateyourmusic = function (uri, count) {
  count = count || 0
  function getPages (nextUri, result, count) {
    nextUri = URI(nextUri).absoluteTo(uri).toString()
    console.log(nextUri + '\n')
    return http(nextUri).then(function (data) {
      var html = $($.parseHTML(data))
      var lines = ''
      html.find('div.chart_details').each(function () {
        var artist = util.normalize($(this).find('a.artist').text())
        var album = util.normalize($(this).find('a.album').text())
        lines += '#album ' + artist + '\t-\t' + album + '\n'
      })
      console.log(util.stripWhitespace(lines, '\\t') + '\n')
      result += lines
      if (count === 1) {
        return result
      } else {
        var next = html.find('a.navlinknext')
        if (next.length > 0) {
          nextUri = next.attr('href')
          return getPages(nextUri, result, count - 1)
        } else {
          return result
        }
      }
    })
  }
  return getPages(uri, '', count)
}

/**
 * Scrape a Reddit forum.
 *
 * Handles post listing and comment threads. Employs Bob Nisco's
 * heuristic for parsing comments.
 *
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} [count] - The number of pages to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.reddit = function (uri, count) {
  count = count || 1
  function getPages (nextUri, result, count) {
    nextUri = URI(nextUri).absoluteTo(uri).toString()
    console.log(nextUri + '\n')
    return http(nextUri).then(function (data) {
      var html = $($.parseHTML(data))
      var lines = ''
      if (uri.match(/\/comments\//gi)) {
        // comments thread
        html.find('div.entry div.md').each(function () {
          // first assumption: if there are links,
          // they are probably links to songs
          var links = $(this).find('a')
          if (links.length > 0) {
            links.each(function () {
              var txt = $(this).text()
              if (!txt.match(/https?:/gi)) {
                lines += util.stripNoise(txt) + '\n'
              }
            })
            return
          }
          // second assumption: if there are multiple sentences,
          // the song is the first one
          var body = $(this).text()
          var sentences = body.split('.')
          if (sentences.length > 1) {
            lines += util.stripNoise(sentences[0]) + '\n'
            return
          }
          // third assumption: if there are multiple lines to a comment,
          // then the song will be on the first line with a user's
          // comments on other lines after it
          var lines = body.split('\n')
          if (lines.length > 1) {
            lines += util.stripNoise(lines[0]) + '\n'
            return
          }
          // fall-back case
          lines += util.stripNoise(body) + '\n'
        })
      } else {
        // post listing
        html.find('a.title').each(function () {
          var track = util.stripNoise($(this).text())
          lines += track + '\n'
        })
      }
      console.log(util.stripWhitespace(lines, '\\t') + '\n')
      result += lines
      if (count === 1) {
        return result
      } else {
        var next = html.find('.next-button a')
        if (next.length > 0) {
          nextUri = next.attr('href')
          return getPages(nextUri, result, count - 1)
        } else {
          return result
        }
      }
    })
  }
  return getPages(uri, '', count)
}

/**
 * Scrape a web page.
 *
 * This is a fall-back function in case none of the other
 * scraping functions apply.
 *
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.webpage = function (uri) {
  console.log(uri + '\n')
  return http(uri).then(function (data) {
    var html = $($.parseHTML(data))
    var result = ''
    html.find('a').each(function () {
      var track = util.stripNoise($(this).text())
      if (track) {
        result += track + '\n'
      }
    })
    result = result.trim()
    console.log(result + '\n')
    return result
  })
}

/**
 * Scrape a YouTube playlist.
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.youtube = function (uri) {
  console.log(uri + '\n')
  return http(uri).then(function (data) {
    var html = $($.parseHTML(data))
    var result = ''
    html.find('div.playlist-video-description h4, a.pl-video-title-link').each(function () {
      var track = util.stripNoise($(this).text())
      result += track + '\n'
    })
    result = result.trim()
    console.log(result + '\n')
    return result
  })
}

module.exports = WebScraper
