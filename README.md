# aws-tamu-lambda-redirect-rules
Lambda@Edge redirection rules, tests, and pipeline

## Usage Summary

Fork or clone this repository and modify *rules.json* file in the rules directory, and write tests in the tests directory. 
The repository should be configured to fail merge if merge tests fail. 

## Rules

Simply make modifications to the *rules.json* files in the rules directory in a branch called *development*

## Tests

Write tests for any important rules by creating pairs of tests. Each pair should look like this:
1. event-test_name.json
2. result-test_name.json

### Event file

The event test file should be based on the provided sample, and is a standard CloudFront request event.

### Result file

The result test file should be copied from the results of running the *test_event.sh* file in the sam directory.

### Testing locally

During development, it is desirable to test redirects locally before deploying to the staging environment. This
can be accomplished by running the *test_event.sh* script in the *sam* directory. A typical invocation might
look like this:

```bash
$ ./test_event.sh events/index_redirect.json ../rules/rules.json
```

The output JSON can be copied to a *result* file (mentioned above) to automatically test the page rewrite

## Deployment Workflow

Deploying changes to the rewrite rules should follow this workflow:
1. Commit and push a new version with tests and an updated rules.json file to the *development* branch
2. Submit a PR to merge the changes to the *staging* branch
3. The merge is only possible if the tests pass
4. Perform manual checks on the staging site. Be aware that changes to the staging site rules will take time 
   (up to the rule cache time) to take effect
5. Submit a PR to merge changes to the *main* branch
6. The merge is only possible if the tests pass
7. Be aware that changes to the production site rules will take time (up to the rule cache time) to take effect
# dmc-vpmc-covid-lambda-redirect-rules
