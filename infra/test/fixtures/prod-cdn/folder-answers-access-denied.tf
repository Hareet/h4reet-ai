# The index function without its redirect: /disclosure, without its slash, answers S3's AccessDenied, where nginx
# redirects it (group 8's review B, the smaller ones).
# expect: index: no function in edge.tf, from W1, makes a folder's path its index.html and redirects a folder's path without its slash
resource "aws_cloudfront_function" "index" {
  name    = "h4-site-index"
  runtime = "cloudfront-js-2.0"
  comment = "A folder's path to its index.html (spec 001 contracts/edge.md §3)"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      if (request.uri.endsWith("/")) {
        request.uri += "index.html";
      }
      return request;
    }
  EOT
}
