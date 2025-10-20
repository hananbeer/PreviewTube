(() => {
  let transcripts = {}

  function injectStyle() {
    let style = document.createElement('style')
    style.textContent = `
      [data-transcript] {
        z-index: 99999;
        font-size: 16px;
        width: 100%;
        overflow: hidden;
        line-height: 1.0;
        font-weight: 500;
        white-space: break-spaces;

        /* light mode */
        /*
        color: white;
        background-color: rgba(0, 0, 0, 0.9);
        text-shadow: red 2px 2px 5px;
        */

        /* dark mode */
        color: black;
        background-color: rgba(255, 255, 255, 0.9);
        text-shadow: orange 2px 2px 5px;

        /* on top of thumbnail */
        /*
        pointer-events: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 72%;
        background-color: #ffffffa0;
        */
      }
    `

    document.head.appendChild(style)
  }

  injectStyle()

  function getVideoId(url) {
    const urlObj = new URL(url)
    return urlObj.searchParams.get('v')
  }

  function getThumbnailElement(videoId) {
    let thumbnail = document.querySelector(`a[href*="/watch?v=${videoId}"]`).closest('div[id="content"]')
    thumbnail.style.flexDirection = 'column'
    return thumbnail
  }

  function injectTranscriptElement(parent, text) {
    if (!parent)
      return

    // if (parent.querySelector('[data-transcript]'))
    //   return

    let el = document.createElement('div')
    el.setAttribute('data-transcript', 'true')
    el.textContent = text.slice(0, 300) //'Loading...'
    parent.appendChild(el)
  }

  function selectElements() {
    let aTags = document.querySelectorAll('a[href*="/watch?v="]')

    for (let a of aTags) {
      let videoId = getVideoId('https://youtube.com' + a.href)
      if (!transcripts[videoId]) {
        continue
      }

      transcripts[videoId] = { loading: true, data: null, text: null }
      // if (!a.querySelector('yt-collections-stack'))
      injectTranscriptElement(a.children[0], 'Loading...')

      let zone = a.closest('div[class*="yt-lockup-view-model "]')
      if (!zone)
        return

      // this will trigger request for the transcript from /timedtext endpoint
      // zone.dispatchEvent(new MouseEvent('mouseenter'))
      // setTimeout(() => {
      //   zone.dispatchEvent(new MouseEvent('mouseleave'))
      // }, 1000)

      // injectTranscriptElement(videoId)

      break
    }
  }

  function youtubeTranscriptToSimpleTranscript(transcript) {
    let parts = transcript.events
      .map(ev => ev.segs ? ev.segs.map(seg => seg.utf8).join('\n') : '')

    return parts.join('\n\n').trim()
  }

  setTimeout(() => {
    let ogXHR = XMLHttpRequest;
    class XHRHook extends XMLHttpRequest {
      open(method, url, ...args) {
        if (url.startsWith('https://www.youtube.com/api/timedtext?')) {
          console.log('TIMED TEXT CALLED:', url)
          fetch(url).then(res => res.json()).then(data => {
            console.log(data)
            let id = getVideoId(url)
            if (transcripts[id]) {
              transcripts[id].loading = false
              return
            }

            let text = youtubeTranscriptToSimpleTranscript(data)
            transcripts[id] = { loading: false, data, text }
            let thumbnail = getThumbnailElement(id)
            injectTranscriptElement(thumbnail, text)
          })
          this.skip = true
          return
        }

        return ogXHR.prototype.open.bind(this)(method, url, ...args)
      }

      send(...args) {
        if (this.skip)
          return

        return ogXHR.prototype.send.bind(this)(...args)
      }
    }
    XMLHttpRequest = XHRHook;

    // setInterval(selectElements, 1000)
  }, 1000)
})()
